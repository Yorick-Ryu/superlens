import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Group, Rect, Circle, Line, Transformer } from 'react-konva';
import useImage from 'use-image';
import { Upload } from 'lucide-react'; // Removed unused imports
import type { AppState } from '../types';
import { getRectConnectionPoints, getCircleTangents } from '../utils/geometry';

const INITIAL_STATE: AppState = {
    image: null,
    imageSize: { width: 800, height: 600 },
    source: { x: 100, y: 100, width: 100, height: 100, type: 'circle', strokeWidth: 3, stroke: '#4E6BFE' },
    target: { x: 300, y: 100, width: 200, height: 200, type: 'circle', strokeWidth: 3, stroke: '#4E6BFE' },
    magnification: 1.5,
    showGuides: true,
    backgroundOpacity: 0.85,
    connectionColor: '#4E6BFE',
    connectionWidth: 3,
    exportMode: 'full',
};

const SuperLens: React.FC = () => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [img] = useImage(imageSrc || '');
    const [state, setState] = useState<AppState>(INITIAL_STATE);
    const [sidebarWidth, setSidebarWidth] = useState(300);
    const [isResizing, setIsResizing] = useState(false);
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
    const [exportState, setExportState] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle');
    const stageRef = useRef<any>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // Update canvas size on window resize or sidebar width change
    useEffect(() => {
        const updateCanvasSize = () => {
            if (canvasRef.current) {
                const rect = canvasRef.current.getBoundingClientRect();
                setCanvasSize({ width: rect.width, height: rect.height });
            }
        };

        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);

        return () => {
            window.removeEventListener('resize', updateCanvasSize);
        };
    }, [sidebarWidth]);

    useEffect(() => {
        if (img && canvasSize.width > 0 && canvasSize.height > 0) {
            // Fit image to canvas
            const maxWidth = canvasSize.width;
            const maxHeight = canvasSize.height;
            const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
            const width = img.width * ratio;
            const height = img.height * ratio;

            setState(prev => ({
                ...prev,
                image: img,
                imageSize: { width, height },
                // Center shapes initially with some defaults
                source: {
                    ...prev.source,
                    x: width * 0.25 - 75,
                    y: height * 0.5 - 75,
                    width: 150,
                    height: 150
                },
                target: {
                    ...prev.target,
                    x: width * 0.75 - 125,
                    y: height * 0.5 - 125,
                    width: 250,
                    height: 250
                }
            }));
        }
    }, [img, canvasSize]);

    // Refs for transformers
    const sourceRef = useRef<any>(null);
    const targetRef = useRef<any>(null);
    const sourceTrRef = useRef<any>(null);
    const targetTrRef = useRef<any>(null);
    const magnifierGroupRef = useRef<any>(null);

    useEffect(() => {
        if (sourceTrRef.current && sourceRef.current) {
            sourceTrRef.current.nodes([sourceRef.current]);
            sourceTrRef.current.getLayer()?.batchDraw();
        }
        if (targetTrRef.current && targetRef.current) {
            targetTrRef.current.nodes([targetRef.current]);
            targetTrRef.current.getLayer()?.batchDraw();
        }
    }, [state.source.type, state.target.type, state.image]); // Re-attach when shape changes

    const handleDragEnd = (role: 'source' | 'target', e: any) => {
        setState(prev => ({
            ...prev,
            [role]: {
                ...prev[role],
                x: e.target.x(),
                y: e.target.y(),
            }
        }));
    };

    const handleTransformEnd = (role: 'source' | 'target', e: any) => {
        const node = e.target;
        // Get absolute position before resetting scale
        // This is crucial because when resizing a shape inside a Group, 
        // the Transformer modifies the Shape's local transform. 
        // We want to capture the NEW Global position and apply it to our State (which drives the Group position).
        const absPos = node.getAbsolutePosition();

        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        // Reset scale and update width/height
        node.scaleX(1);
        node.scaleY(1);

        // Only reset local position for target because it lives inside a group
        // and we are moving the group to absPos.
        if (role === 'target') {
            node.x(0);
            node.y(0);
        }

        setState(prev => ({
            ...prev,
            [role]: {
                ...prev[role],
                x: absPos.x,
                y: absPos.y,
                width: Math.max(5, node.width() * scaleX),
                height: Math.max(5, node.height() * scaleY),
                rotation: node.rotation(),
            }
        }));
    };

    // Convert a shape preserving its center when switching between 'rect' and 'circle'
    const convertShapePreserveCenter = (shape: any, toType: 'rect' | 'circle') => {
        if (shape.type === toType) return { ...shape };

        if (toType === 'circle') {
            // rect -> circle: compute center from rect (x,y is top-left)
            const centerX = shape.x + (shape.width || 0) / 2;
            const centerY = shape.y + (shape.height || 0) / 2;
            const diameter = Math.max(shape.width || shape.height || 0, 1);
            return {
                ...shape,
                type: 'circle',
                x: centerX,
                y: centerY,
                width: diameter,
                height: diameter,
            };
        }

        // circle -> rect: interpret circle x,y as center, convert to top-left
        const rectX = (shape.x || 0) - (shape.width || 0) / 2;
        const rectY = (shape.y || 0) - (shape.height || 0) / 2;
        return {
            ...shape,
            type: 'rect',
            x: rectX,
            y: rectY,
            width: shape.width,
            height: shape.height,
        };
    };

    const renderMagnifierLayer = () => {
        if (!state.image) return null;

        const sourceCenter = state.source.type === 'rect'
            ? { x: state.source.x + state.source.width / 2, y: state.source.y + state.source.height / 2 }
            : { x: state.source.x, y: state.source.y };

        // Target group logic
        const targetCenterInGroup = state.target.type === 'rect'
            ? { x: state.target.width / 2, y: state.target.height / 2 }
            : { x: 0, y: 0 };

        const groupProps = state.target.type === 'rect'
            ? { x: state.target.x, y: state.target.y, rotation: state.target.rotation }
            : { x: state.target.x, y: state.target.y, rotation: state.target.rotation };

        // Calculate offset
        const imgX = targetCenterInGroup.x - sourceCenter.x * state.magnification;
        const imgY = targetCenterInGroup.y - sourceCenter.y * state.magnification;

        return (
            <Group
                {...groupProps}
                draggable
                onDragMove={(e) => handleDragEnd('target', e)}
                onDragEnd={(e) => handleDragEnd('target', e)}
                ref={magnifierGroupRef}
            >
                <Group
                    clipFunc={(ctx) => {
                        if (state.target.type === 'circle') {
                            ctx.arc(0, 0, state.target.width / 2, 0, Math.PI * 2, false);
                        } else {
                            ctx.rect(0, 0, state.target.width, state.target.height);
                        }
                    }}
                >
                    <KonvaImage
                        image={state.image}
                        width={state.imageSize.width * state.magnification}
                        height={state.imageSize.height * state.magnification}
                        x={imgX}
                        y={imgY}
                        listening={false}
                    />
                </Group>

                {state.target.type === 'circle' ? (
                    <Circle
                        radius={state.target.width / 2}
                        stroke={state.target.stroke || "#808080"}
                        strokeWidth={state.target.strokeWidth || 6}
                        ref={targetRef}
                        scaleX={1}
                        scaleY={1}
                        onTransform={(e) => handleTransformEnd('target', e)}
                        onTransformEnd={(e) => handleTransformEnd('target', e)}
                    />
                ) : (
                    <Rect
                        width={state.target.width}
                        height={state.target.height}
                        stroke={state.target.stroke || "#808080"}
                        strokeWidth={state.target.strokeWidth || 6}
                        ref={targetRef}
                        scaleX={1}
                        scaleY={1}
                        onTransform={(e) => handleTransformEnd('target', e)}
                        onTransformEnd={(e) => handleTransformEnd('target', e)}
                    />
                )}
            </Group>
        );
    };

    const renderConnections = () => {
        const s = state.source;
        const t = state.target;
        let lines: any[] = [];

        // Normalize for geometry calculations
        // If mixed, convert circle to bounding box rect
        const sRect = s.type === 'circle'
            ? { x: s.x - s.width / 2, y: s.y - s.width / 2, width: s.width, height: s.width, type: 'rect' as const, rotation: s.rotation }
            : s;
        const tRect = t.type === 'circle'
            ? { x: t.x - t.width / 2, y: t.y - t.width / 2, width: t.width, height: t.width, type: 'rect' as const, rotation: t.rotation }
            : t;

        if (s.type === 'circle' && t.type === 'circle') {
            const tangents = getCircleTangents(s, t);
            lines = tangents.map(pair => [pair[0].x, pair[0].y, pair[1].x, pair[1].y]);
        } else {
            // Rect-Rect or Mixed -> use corners
            const conns = getRectConnectionPoints(sRect, tRect);
            lines = conns.map(pair => [pair[0].x, pair[0].y, pair[1].x, pair[1].y]);
        }

        return (
            <Group listening={false}>
                {lines.map((pts, i) => (
                    <Line
                        key={i}
                        name="connection-line"
                        points={pts}
                        stroke={state.connectionColor}
                        strokeWidth={state.connectionWidth}
                        dash={[4, 4]}
                    />
                ))}
            </Group>
        );
    };

    const handleExport = async () => {
        if (!stageRef.current || !img) {
            setExportState('error');
            setTimeout(() => setExportState('idle'), 2000);
            return;
        }

        setExportState('exporting');
        // Let the UI repaint before toDataURL blocks the thread
        await new Promise(resolve => requestAnimationFrame(resolve));

        try {
            const originalWidth = img.width;
            const displayedWidth = state.imageSize.width;
            const displayedHeight = state.imageSize.height;
            const scaleRatio = originalWidth / displayedWidth;

            if (state.exportMode === 'full') {
                const transformers = [sourceTrRef.current, targetTrRef.current];
                transformers.forEach(t => t?.hide());
                const uri = stageRef.current.toDataURL({ pixelRatio: scaleRatio, x: 0, y: 0, width: displayedWidth, height: displayedHeight });
                downloadURI(uri, 'superlens-export.png');
                transformers.forEach(t => t?.show());
            } else {
                const transformers = [sourceTrRef.current, targetTrRef.current];
                const sourceShape = sourceRef.current;
                const connections = stageRef.current.find('.connection-line');
                transformers.forEach(t => t?.hide());
                sourceShape?.hide();
                connections.forEach((line: any) => line.hide());
                const uri = stageRef.current.toDataURL({ pixelRatio: scaleRatio, x: 0, y: 0, width: displayedWidth, height: displayedHeight });
                downloadURI(uri, 'superlens-lens.png');
                transformers.forEach(t => t?.show());
                sourceShape?.show();
                connections.forEach((line: any) => line.show());
            }

            setExportState('done');
            setTimeout(() => setExportState('idle'), 2200);
        } catch {
            setExportState('error');
            setTimeout(() => setExportState('idle'), 2000);
        }
    };

    const downloadURI = (uri: string, name: string) => {
        const link = document.createElement('a');
        link.download = name;
        link.href = uri;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const url = URL.createObjectURL(e.target.files[0]);
            setImageSrc(url);
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth >= 250 && newWidth <= 600) {
                setSidebarWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);


    return (
        <div className="flex w-full h-screen bg-[#16161e]">
            {/* Canvas Area */}
            <div className="flex-1 overflow-hidden relative flex items-center justify-center" ref={canvasRef}>
                {/* Upload Overlay */}
                {!imageSrc && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#16161e]">
                        <label className="group p-10 border border-dashed border-[#333348] rounded-xl hover:border-[#2563EB] transition-all duration-200 cursor-pointer block hover:bg-[#1e1e2e]">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="sr-only"
                            />
                            <div className="flex flex-col items-center gap-4 pointer-events-none group-hover:scale-105 transition-transform duration-200">
                                <Upload size={40} className="text-[#64647a] group-hover:text-[#2563EB] transition-colors duration-200" />
                                <p className="text-sm font-medium text-[#64647a] group-hover:text-[#9898b2] transition-colors duration-200">Drop or click to add your image</p>
                            </div>
                        </label>
                    </div>
                )}
                <Stage
                    width={canvasSize.width}
                    height={canvasSize.height}
                    ref={stageRef}
                    style={{ background: '#111' }}
                >
                    <Layer>
                        {img && (
                            <>
                                <KonvaImage
                                    image={img}
                                    width={state.imageSize.width}
                                    height={state.imageSize.height}
                                    opacity={1}
                                />
                                {/* Black overlay mask - opacity is inverse of backgroundOpacity */}
                                <Rect
                                    x={0}
                                    y={0}
                                    width={state.imageSize.width}
                                    height={state.imageSize.height}
                                    fill="black"
                                    opacity={1 - state.backgroundOpacity}
                                    listening={false}
                                />
                            </>
                        )}

                        {state.source.width > 0 && state.showGuides && renderConnections()}

                        {/* Source Selection UI */}
                        {state.source.type === 'circle' ? (
                            <Circle
                                x={state.source.x}
                                y={state.source.y}
                                radius={state.source.width / 2}
                                stroke={state.source.stroke || "#808080"}
                                strokeWidth={state.source.strokeWidth || 3}
                                dash={state.source.dash || [5, 5]}
                                draggable
                                onDragMove={(e) => handleDragEnd('source', e)}
                                onDragEnd={(e) => handleDragEnd('source', e)}
                                onTransform={(e) => handleTransformEnd('source', e)}
                                onTransformEnd={(e) => handleTransformEnd('source', e)}
                                ref={sourceRef}
                                scaleX={1}
                                scaleY={1}
                                rotation={state.source.rotation}
                            />
                        ) : (
                            <Rect
                                x={state.source.x}
                                y={state.source.y}
                                width={state.source.width}
                                height={state.source.height}
                                stroke={state.source.stroke || "#808080"}
                                strokeWidth={state.source.strokeWidth || 3}
                                dash={state.source.dash || [5, 5]}
                                draggable
                                onDragMove={(e) => handleDragEnd('source', e)}
                                onDragEnd={(e) => handleDragEnd('source', e)}
                                onTransform={(e) => handleTransformEnd('source', e)}
                                onTransformEnd={(e) => handleTransformEnd('source', e)}
                                ref={sourceRef}
                                scaleX={1}
                                scaleY={1}
                                rotation={state.source.rotation}
                            />
                        )}

                        {renderMagnifierLayer()}

                        <Transformer
                            ref={sourceTrRef}
                            boundBoxFunc={(oldBox, newBox) => {
                                if (newBox.width < 10 || newBox.height < 10) return oldBox;
                                return newBox;
                            }}
                            enabledAnchors={state.source.type === 'circle' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : undefined}
                        />
                        <Transformer
                            ref={targetTrRef}
                            boundBoxFunc={(oldBox, newBox) => {
                                if (newBox.width < 10 || newBox.height < 10) return oldBox;
                                return newBox;
                            }}
                            enabledAnchors={state.target.type === 'circle' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : undefined}
                        />
                    </Layer>
                </Stage>
            </div>

            {/* Resizer */}
            <div
                className="w-1 bg-[#333] hover:bg-[#2563EB] cursor-col-resize transition-colors relative group"
                onMouseDown={handleMouseDown}
            >
                <div className="absolute inset-y-0 -left-1 -right-1" />
            </div>

            {/* Sidebar Controls */}
            <div className="bg-[#1e1e2a] px-6 py-4 border-l border-[#2a2a3a] flex flex-col gap-3 overflow-y-auto" style={{ width: `${sidebarWidth}px` }}>
                <h1 className="font-display text-base font-bold tracking-[0.08em] text-white uppercase">
                    SuperLens
                </h1>

                {/* Re-upload Button */}
                <div className="relative">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        id="reupload-input"
                    />
                    <button
                        className="w-full bg-[#2a2a38] hover:bg-[#323244] text-[#c8c8d8] py-2 rounded-md text-xs font-medium tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                        onClick={() => document.getElementById('reupload-input')?.click()}
                    >
                        <Upload size={14} />
                        {imageSrc ? 'Change Image' : 'Upload Image'}
                    </button>
                </div>

                {/* Shape Types */}
                <div>
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#64647a] mb-2">Shape</h3>
                    <div className="flex bg-[#111118] rounded-md p-1">
                        <button
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-all active:scale-[0.96] ${state.source.type === 'circle' ? 'bg-[#2563EB] text-white' : 'text-[#64647a] hover:text-[#9898b2] hover:bg-[#1e1e2e]'}`}
                            onClick={() => setState(s => ({
                                ...s,
                                source: convertShapePreserveCenter(s.source, 'circle'),
                                target: convertShapePreserveCenter(s.target, 'circle')
                            }))}
                        >
                            <div className="w-3 h-3 border border-current rounded-full flex-shrink-0"></div>
                            Circle
                        </button>
                        <button
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-all active:scale-[0.96] ${state.source.type === 'rect' ? 'bg-[#2563EB] text-white' : 'text-[#64647a] hover:text-[#9898b2] hover:bg-[#1e1e2e]'}`}
                            onClick={() => setState(s => ({
                                ...s,
                                source: convertShapePreserveCenter(s.source, 'rect'),
                                target: convertShapePreserveCenter(s.target, 'rect')
                            }))}
                        >
                            <div className="w-3 h-3 border border-current flex-shrink-0"></div>
                            Rect
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#9898b2]">Magnification</label>
                    <input
                        type="range"
                        min="1"
                        max="5"
                        step="0.1"
                        value={state.magnification}
                        onChange={(e) => setState(s => ({ ...s, magnification: parseFloat(e.target.value) }))}
                        className="w-full accent-[#2563EB]"
                    />
                    <div className="flex justify-between text-[10px] text-[#505060] tabular-nums">
                        <span>1×</span>
                        <span className="text-[#9898b2]">{state.magnification.toFixed(1)}×</span>
                        <span>5×</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-xs font-medium text-[#9898b2]">Background Dim</label>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={1 - state.backgroundOpacity}
                        onChange={(e) => setState(s => ({ ...s, backgroundOpacity: 1 - parseFloat(e.target.value) }))}
                        className="w-full accent-[#2563EB]"
                    />
                    <div className="flex justify-between text-[10px] text-[#505060] tabular-nums">
                        <span>Off</span>
                        <span className="text-[#9898b2]">{Math.round((1 - state.backgroundOpacity) * 100)}%</span>
                        <span>Full</span>
                    </div>
                </div>

                {/* Source */}
                <div className="space-y-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#64647a] mb-2">Source</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-[10px] font-medium uppercase tracking-wider text-[#64647a] mb-1 block">Color</label>
                            <input
                                type="color"
                                className="w-full h-8 bg-transparent cursor-pointer rounded-md"
                                value={state.source.stroke || "#808080"}
                                onChange={(e) => setState(s => ({ ...s, source: { ...s.source, stroke: e.target.value } }))}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-medium uppercase tracking-wider text-[#64647a] mb-1 block">Width</label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                step="1"
                                value={state.source.strokeWidth || 3}
                                onChange={(e) => setState(s => ({ ...s, source: { ...s.source, strokeWidth: Number(e.target.value) } }))}
                                className="w-full accent-[#2563EB]"
                            />
                            <div className="text-[10px] text-[#9898b2] text-center mt-1 tabular-nums">{state.source.strokeWidth || 3}px</div>
                        </div>
                    </div>
                </div>

                {/* Connection */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#64647a]">Connection</h3>
                        <button
                            className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${state.showGuides ? 'bg-[#2563EB]' : 'bg-[#333344]'}`}
                            onClick={() => setState(s => ({ ...s, showGuides: !s.showGuides }))}
                            title={state.showGuides ? 'Hide lines' : 'Show lines'}
                        >
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${state.showGuides ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-[10px] font-medium uppercase tracking-wider text-[#64647a] mb-1 block">Color</label>
                            <input
                                type="color"
                                className="w-full h-8 bg-transparent cursor-pointer rounded-md"
                                value={state.connectionColor}
                                onChange={(e) => setState(s => ({ ...s, connectionColor: e.target.value }))}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-medium uppercase tracking-wider text-[#64647a] mb-1 block">Width</label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                step="1"
                                value={state.connectionWidth}
                                onChange={(e) => setState(s => ({ ...s, connectionWidth: Number(e.target.value) }))}
                                className="w-full accent-[#2563EB]"
                            />
                            <div className="text-[10px] text-[#9898b2] text-center mt-1 tabular-nums">{state.connectionWidth}px</div>
                        </div>
                    </div>
                </div>

                {/* Magnifier */}
                <div className="space-y-2">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[#64647a] mb-2">Magnifier</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-[10px] font-medium uppercase tracking-wider text-[#64647a] mb-1 block">Color</label>
                            <input
                                type="color"
                                className="w-full h-8 bg-transparent cursor-pointer rounded-md"
                                value={state.target.stroke || "#808080"}
                                onChange={(e) => setState(s => ({ ...s, target: { ...s.target, stroke: e.target.value } }))}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-medium uppercase tracking-wider text-[#64647a] mb-1 block">Width</label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                step="1"
                                value={state.target.strokeWidth || 6}
                                onChange={(e) => setState(s => ({ ...s, target: { ...s.target, strokeWidth: Number(e.target.value) } }))}
                                className="w-full accent-[#2563EB]"
                            />
                            <div className="text-[10px] text-[#9898b2] text-center mt-1 tabular-nums">{state.target.strokeWidth || 6}px</div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mt-auto">
                    <button
                        className={`flex-1 py-2 text-xs font-medium tracking-wide rounded-md transition-all active:scale-[0.96] ${state.exportMode === 'full' ? 'bg-[#2563EB] text-white' : 'bg-[#2a2a38] text-[#9898b2] hover:bg-[#323244]'}`}
                        onClick={() => setState(s => ({ ...s, exportMode: 'full' }))}
                    >
                        Full Image
                    </button>
                    <button
                        className={`flex-1 py-2 text-xs font-medium tracking-wide rounded-md transition-all active:scale-[0.96] ${state.exportMode === 'magnifier' ? 'bg-[#2563EB] text-white' : 'bg-[#2a2a38] text-[#9898b2] hover:bg-[#323244]'}`}
                        onClick={() => setState(s => ({ ...s, exportMode: 'magnifier' }))}
                    >
                        Lens Only
                    </button>
                </div>

                <button
                    className={`w-full py-3 rounded-md text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed ${
                        exportState === 'done'
                            ? 'bg-[#1a6b3a] text-white'
                            : exportState === 'error'
                            ? 'bg-[#6b1a1a] text-[#ffaaaa]'
                            : exportState === 'exporting'
                            ? 'bg-[#1d4fb8] text-white opacity-80'
                            : 'bg-[#2563EB] hover:bg-[#1d4fb8] text-white'
                    }`}
                    onClick={handleExport}
                    disabled={exportState === 'exporting'}
                >
                    {exportState === 'done' ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path className="export-check-path" d="M2 7l3.5 3.5L12 3" />
                            </svg>
                            Saved to Downloads
                        </span>
                    ) : exportState === 'error' ? (
                        'Load an image first'
                    ) : exportState === 'exporting' ? (
                        'Exporting…'
                    ) : (
                        `Export ${state.exportMode === 'full' ? 'Full Image' : 'Lens Only'}`
                    )}
                </button>
            </div>
        </div>
    );
};

export default SuperLens;
