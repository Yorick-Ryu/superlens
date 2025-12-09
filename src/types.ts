export interface Dimensions {
    width: number;
    height: number;
}

export type ShapeType = 'rect' | 'circle';

export interface ShapeConfig {
    x: number;
    y: number;
    width: number; // For circle, we'll use this as diameter or 2*radius
    height: number;
    type: ShapeType;
    rotation?: number;
    stroke?: string;
    strokeWidth?: number;
    dash?: number[];
}

export interface AppState {
    image: HTMLImageElement | null;
    imageSize: Dimensions;
    source: ShapeConfig;
    target: ShapeConfig;
    magnification: number;
    showGuides: boolean; // Toggle connections
    backgroundOpacity: number; // Background image opacity (0-1)
    connectionColor: string; // Connection lines color
    connectionWidth: number; // Connection lines width
    exportMode: 'full' | 'magnifier';
}
