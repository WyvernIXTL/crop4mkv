export type Crop = {
    top: number;
    bottom: number;
    left: number;
    right: number;
};

export enum Direction {
    X,
    Y,
}

export type Axis = {
    length: number;
    offset: number;
    direction: Direction;
};

export type VideoInfo = { width: number; height: number; duration: number };
