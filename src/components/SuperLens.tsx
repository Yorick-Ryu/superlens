import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Group, Rect, Circle, Line, Transformer } from 'react-konva';
import useImage from 'use-image';
import { Upload } from 'lucide-react'; // Removed unused imports
import type { AppState } from '../types';
import { getRectConnectionPoints, getCircleTangents } from '../utils/geometry';

const INITIAL_STATE: AppState = {
    image: null,
    imageSize: { width: 800, height: 600 },
    source: { x: 100, y: 100, width: 100, height: 100, type: 'circle', strokeWidth: 3, stroke: '#2663EB' },
    target: { x: 300, y: 100, width: 200, height: 200, type: 'circle', strokeWidth: 6, stroke: '#2663EB' },
    magnification: 1.5,
    showGuides: true,
    backgroundOpacity: 0.85,
    connectionColor: '#2663EB',
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
        if (state.exportMode === 'full') {
            // Hide UI elements briefly? Or just export stage
            // The stage contains transformers and selection handles which we might not want.
            // But the request says "default export source frame and connection lines and magnifier area"
            // It implies we SHOULD export the source border and connections.
            // Transformers (handles) should probably be hidden.

            const transformers = [sourceTrRef.current, targetTrRef.current];
            transformers.forEach(t => t?.hide());

            const uri = stageRef.current.toDataURL({ pixelRatio: 2 }); // High res
            downloadURI(uri, 'superlens-export.png');

            transformers.forEach(t => t?.show());
        } else {
            // Magnifier Only - export background image and lens only
            if (!stageRef.current) return;
            
            // Hide elements we don't want in the export
            const transformers = [sourceTrRef.current, targetTrRef.current];
            const sourceShape = sourceRef.current;
            const connections = stageRef.current.find('.connection-line');
            
            transformers.forEach(t => t?.hide());
            sourceShape?.hide();
            connections.forEach((line: any) => line.hide());

            const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
            downloadURI(uri, 'superlens-magnifier.png');

            // Restore visibility
            transformers.forEach(t => t?.show());
            sourceShape?.show();
            connections.forEach((line: any) => line.show());
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
        <div className="flex w-full h-screen bg-[#1a1a1a]">
            {/* Canvas Area */}
            <div className="flex-1 overflow-hidden relative flex items-center justify-center" ref={canvasRef}>
                {/* Upload Overlay */}
                {!imageSrc && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 bg-[#1a1a1a]">
                        <div className="p-8 border-2 border-dashed border-gray-600 rounded-xl hover:border-blue-500 transition-colors cursor-pointer relative">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center gap-4">
                                <Upload size={48} className="text-gray-400" />
                                <p className="text-xl font-medium">Drop an image here or click to upload</p>
                            </div>
                        </div>
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
                            <KonvaImage
                                image={img}
                                width={state.imageSize.width}
                                height={state.imageSize.height}
                                opacity={state.backgroundOpacity}
                            />
                        )}

                        {state.source.width > 0 && renderConnections()}

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
                className="w-1 bg-[#333] hover:bg-[#2663EB] cursor-col-resize transition-colors relative group"
                onMouseDown={handleMouseDown}
            >
                <div className="absolute inset-y-0 -left-1 -right-1" />
            </div>

            {/* Sidebar Controls */}
            <div className="bg-[#242424] px-6 py-3 border-l border-[#333] flex flex-col gap-3 overflow-y-auto" style={{ width: `${sidebarWidth}px` }}>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
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
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        onClick={() => document.getElementById('reupload-input')?.click()}
                    >
                        <Upload size={18} />
                        Re-upload Image
                    </button>
                </div>

                {/* Shape Types */}
                <div>
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Shape</h3>
                    <div className="flex bg-black rounded p-1 w-fit">
                        <button
                            className={`p-2 rounded ${state.source.type === 'circle' ? 'bg-[#2663EB]' : 'hover:bg-gray-800'}`}
                            onClick={() => setState(s => ({
                                ...s,
                                source: { ...s.source, type: 'circle' },
                                target: { ...s.target, type: 'circle' }
                            }))}
                            title="Circle"
                        >
                            <div className="w-4 h-4 border border-white rounded-full"></div>
                        </button>
                        <button
                            className={`p-2 rounded ${state.source.type === 'rect' ? 'bg-[#2663EB]' : 'hover:bg-gray-800'}`}
                            onClick={() => setState(s => ({
                                ...s,
                                source: { ...s.source, type: 'rect' },
                                target: { ...s.target, type: 'rect' }
                            }))}
                            title="Rectangle"
                        >
                            <div className="w-4 h-4 border border-white"></div>
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-400">Magnification</label>
                    <input
                        type="range"
                        min="1"
                        max="5"
                        step="0.1"
                        value={state.magnification}
                        onChange={(e) => setState(s => ({ ...s, magnification: parseFloat(e.target.value) }))}
                        className="w-full accent-[#2663EB]"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>1x</span>
                        <span>{state.magnification}x</span>
                        <span>5x</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-400">Background Opacity</label>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={state.backgroundOpacity}
                        onChange={(e) => setState(s => ({ ...s, backgroundOpacity: parseFloat(e.target.value) }))}
                        className="w-full accent-[#2663EB]"
                    />
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>0%</span>
                        <span>{Math.round(state.backgroundOpacity * 100)}%</span>
                        <span>100%</span>
                    </div>
                </div>

                {/* Source */}
                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Source</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Color</label>
                            <input
                                type="color"
                                className="w-full h-8 bg-transparent cursor-pointer rounded"
                                value={state.source.stroke || "#808080"}
                                onChange={(e) => setState(s => ({ ...s, source: { ...s.source, stroke: e.target.value } }))}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-gray-400 mb-1 block">Width</label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                step="1"
                                value={state.source.strokeWidth || 3}
                                onChange={(e) => setState(s => ({ ...s, source: { ...s.source, strokeWidth: Number(e.target.value) } }))}
                                className="w-full accent-[#2663EB]"
                            />
                            <div className="text-xs text-gray-500 text-center mt-1">{state.source.strokeWidth || 3}px</div>
                        </div>
                    </div>
                </div>

                {/* Connection */}
                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Connection</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Color</label>
                            <input
                                type="color"
                                className="w-full h-8 bg-transparent cursor-pointer rounded"
                                value={state.connectionColor}
                                onChange={(e) => setState(s => ({ ...s, connectionColor: e.target.value }))}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-gray-400 mb-1 block">Width</label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                step="1"
                                value={state.connectionWidth}
                                onChange={(e) => setState(s => ({ ...s, connectionWidth: Number(e.target.value) }))}
                                className="w-full accent-[#2663EB]"
                            />
                            <div className="text-xs text-gray-500 text-center mt-1">{state.connectionWidth}px</div>
                        </div>
                    </div>
                </div>

                {/* Magnifier */}
                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Magnifier</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-xs text-gray-400 mb-1 block">Color</label>
                            <input
                                type="color"
                                className="w-full h-8 bg-transparent cursor-pointer rounded"
                                value={state.target.stroke || "#808080"}
                                onChange={(e) => setState(s => ({ ...s, target: { ...s.target, stroke: e.target.value } }))}
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs text-gray-400 mb-1 block">Width</label>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                step="1"
                                value={state.target.strokeWidth || 6}
                                onChange={(e) => setState(s => ({ ...s, target: { ...s.target, strokeWidth: Number(e.target.value) } }))}
                                className="w-full accent-[#2663EB]"
                            />
                            <div className="text-xs text-gray-500 text-center mt-1">{state.target.strokeWidth || 6}px</div>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mt-auto">
                    <button
                        className={`flex-1 py-2 text-sm rounded transition-colors ${state.exportMode === 'full' ? 'bg-[#2663EB] text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        onClick={() => setState(s => ({ ...s, exportMode: 'full' }))}
                    >
                        Full
                    </button>
                    <button
                        className={`flex-1 py-2 text-sm rounded transition-colors ${state.exportMode === 'magnifier' ? 'bg-[#2663EB] text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                        onClick={() => setState(s => ({ ...s, exportMode: 'magnifier' }))}
                    >
                        Magnifier
                    </button>
                </div>

                <button
                    className="w-full bg-[#2663EB] hover:bg-[#1d4fb8] text-white py-3 rounded-lg font-bold transition-colors shadow-lg"
                    onClick={handleExport}
                >
                    Export {state.exportMode === 'full' ? 'Image' : 'Magnifier'}
                </button>
            </div>
        </div>
    );
};

export default SuperLens;
