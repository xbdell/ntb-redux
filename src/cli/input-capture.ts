//TODO: Move this to one of the other files and export it from there

// import { createReadStream } from 'fs';
export interface InputEvent {
  timestamp: number;
  type: 'keyboard' | 'mouse';
  action: 'press' | 'release' | 'move';
  key?: string;
  keyCode?: number;
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
}
