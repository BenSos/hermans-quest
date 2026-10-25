/**
 * Greenmeadow, screen 1. Each character is one tile (22 wide x 13 tall).
 * The top row is the far side of the screen, the bottom row is closest to the camera.
 *
 * Legend:
 *   .  grass          p  dirt path       ~  river         =  wooden bridge
 *   T  tree           h  low hedge       b  bush          r  rock
 *   f  flower patch   W  windmill        S  signpost      C  treasure chest
 *   (rocks can be picked up and thrown when Herman's hands are empty)
 *
 * Want to change the meadow? Edit the letters below and reload the game.
 */
/** A building drawn over a block of 'H' tiles (top-left tile, size in tiles). */
export interface BuildingData { col: number; row: number; w: number; h: number; kind: 'house' | 'smith' | 'armor'; roof: number }

export interface ScreenData {
  name: string;
  spawn: { col: number; row: number };
  /** full: the whole edge is an exit (for secret spots you reach by jumping a hedge). */
  exits: { side: string; label: string; full?: boolean }[];
  sign: string;
  tiles: string[];
  /** Village only: houses and shops. */
  buildings?: BuildingData[];
  /** Village only: who stands on each 'N' tile, in reading order. */
  npcs?: ('bob' | 'jerry')[];
}

export const GREENMEADOW_1: ScreenData = {
  name: 'Greenmeadow',
  spawn: { col: 11.5, row: 10 },
  exits: [
    { side: 'north', label: 'The north road' },
    { side: 'east', label: 'The east road' },
    { side: 'south', label: 'The road to Oakhollow Village' },
  ],
  sign: 'Welcome to Greenmeadow!',
  tiles: [
    'TTTTTTTTTTppTTTTTTTTTT',
    'TT..f.b...pp...f...bTT',
    'T..........p.......r.T',
    'T...W......p...b.....T',
    'T.b...r..f.pp.....f..T',
    '~~~~~~~~~~~==~~~~~~~~~',
    '~~~~~~~~~~~==~~~~~~~~~',
    'T..f.......pp...r..b.T',
    'T.r....C....p..f......',
    'T.....f.....pppppppppp',
    'Tb..S......pp...r..f.T',
    'Th...f.....pp......bhT',
    'hhhhhhhhhhpphhhhhhhhhh',
  ],
};

