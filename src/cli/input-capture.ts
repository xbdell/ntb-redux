/**
 * Common input event types used across the application
 */
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
