/*
 * Copyright Adam McKellar <dev@mckellar.eu> 2025

 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

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
