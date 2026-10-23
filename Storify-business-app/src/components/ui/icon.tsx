import type { ReactNode } from 'react';
import { Platform, type ColorValue } from 'react-native';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { withUniwind } from 'uniwind';

import { cn } from '@/lib/cn';

/**
 * The app's icons, drawn as vectors so they take any size and any token colour.
 * The set is the shopper app's, less what a shop needs only, plus the icons
 * of the business app's own work.
 *
 * To add one: take the 24×24 SVG from Lucide and copy what is inside its
 * `<svg>` here, with the tags capitalised (`<path>` → `<Path>`). Keep `stroke`
 * and `fill` out of the shapes: the wrapper sets them.
 *
 * The shapes below are from Lucide (https://lucide.dev), ISC License,
 * Copyright (c) Lucide Icons and Contributors. `key` is Lucide's `key-round`,
 * `refresh` its `refresh-cw`, `alert-circle` and `x-circle` its `circle-alert`
 * and `circle-x`.
 */
const ICONS = {
  // Navigation
  'arrow-left': (
    <>
      <Path d="m12 19-7-7 7-7" />
      <Path d="M19 12H5" />
    </>
  ),
  /** Send, on the composer's round button. Points up in either direction. */
  'arrow-up': (
    <>
      <Path d="m5 12 7-7 7 7" />
      <Path d="M12 19V5" />
    </>
  ),
  close: (
    <>
      <Path d="M18 6 6 18" />
      <Path d="m6 6 12 12" />
    </>
  ),
  'chevron-right': <Path d="m9 18 6-6-6-6" />,
  'chevron-down': <Path d="m6 9 6 6 6-6" />,
  // The tabs and lists
  home: (
    <>
      <Path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
      <Path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </>
  ),
  /** Orders, on the tab bar. */
  'shopping-bag': (
    <>
      <Path d="M16 10a4 4 0 0 1-8 0" />
      <Path d="M3.103 6.034h17.794" />
      <Path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z" />
    </>
  ),
  search: (
    <>
      <Path d="m21 21-4.34-4.34" />
      <Circle cx="11" cy="11" r="8" />
    </>
  ),
  filter: (
    <>
      <Path d="M10 5H3" />
      <Path d="M12 19H3" />
      <Path d="M14 3v4" />
      <Path d="M16 17v4" />
      <Path d="M21 12h-9" />
      <Path d="M21 19h-5" />
      <Path d="M21 5h-7" />
      <Path d="M8 10v4" />
      <Path d="M8 12H3" />
    </>
  ),
  plus: (
    <>
      <Path d="M5 12h14" />
      <Path d="M12 5v14" />
    </>
  ),
  minus: <Path d="M5 12h14" />,
  trash: (
    <>
      <Path d="M10 11v6" />
      <Path d="M14 11v6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <Path d="M3 6h18" />
      <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  tag: (
    <>
      <Path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <Circle cx="7.5" cy="7.5" r=".5" />
    </>
  ),
  star: (
    <Path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
  ),
  wallet: (
    <>
      <Path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </>
  ),
  store: (
    <>
      <Path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" />
      <Path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244" />
      <Path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" />
    </>
  ),
  // The product editor's sections and media
  image: (
    <>
      <Rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <Circle cx="9" cy="9" r="2" />
      <Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>
  ),
  layers: (
    <>
      <Path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z" />
      <Path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
      <Path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
    </>
  ),
  link: (
    <>
      <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  pencil: (
    <>
      <Path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <Path d="m15 5 4 4" />
    </>
  ),
  copy: (
    <>
      <Rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <Path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  paperclip: (
    <Path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),
  // Account and settings
  user: (
    <>
      <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </>
  ),
  bell: (
    <>
      <Path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <Path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </>
  ),
  'bell-off': (
    <>
      <Path d="M10.268 21a2 2 0 0 0 3.464 0" />
      <Path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742" />
      <Path d="m2 2 20 20" />
      <Path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05" />
    </>
  ),
  chat: (
    <Path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
  ),
  lock: (
    <>
      <Rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  shield: (
    <>
      <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <Path d="m9 12 2 2 4-4" />
    </>
  ),
  'sign-out': (
    <>
      <Path d="m16 17 5-5-5-5" />
      <Path d="M21 12H9" />
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </>
  ),
  calendar: (
    <>
      <Path d="M8 2v4" />
      <Path d="M16 2v4" />
      <Rect width="18" height="18" x="3" y="4" rx="2" />
      <Path d="M3 10h18" />
    </>
  ),
  camera: (
    <>
      <Path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
      <Circle cx="12" cy="13" r="3" />
    </>
  ),
  flashlight: (
    <>
      <Path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z" />
      <Line x1="6" x2="18" y1="6" y2="6" />
      <Line x1="12" x2="12" y1="12" y2="12" />
    </>
  ),
  'flashlight-off': (
    <>
      <Path d="M16 16v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4" />
      <Path d="M7 2h11v4c0 2-2 2-2 4v1" />
      <Line x1="11" x2="18" y1="6" y2="6" />
      <Line x1="2" x2="22" y1="2" y2="22" />
    </>
  ),
  mail: (
    <>
      <Path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />
      <Rect x="2" y="4" width="20" height="16" rx="2" />
    </>
  ),
  phone: (
    <Path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
  ),
  globe: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <Path d="M2 12h20" />
    </>
  ),
  appearance: (
    <>
      <Path d="M12 2v2" />
      <Path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715" />
      <Path d="M16 12a4 4 0 0 0-4-4" />
      <Path d="m19 5-1.256 1.256" />
      <Path d="M20 12h2" />
    </>
  ),
  eye: (
    <>
      <Path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <Path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <Path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <Path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <Path d="m2 2 20 20" />
    </>
  ),
  // Orders
  receipt: (
    <>
      <Path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <Path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <Path d="M12 17.5v-11" />
    </>
  ),
  return: (
    <>
      <Path d="M9 14 4 9l5-5" />
      <Path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </>
  ),
  'order-placed': (
    <>
      <Rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <Path d="M12 11h4" />
      <Path d="M12 16h4" />
      <Path d="M8 11h.01" />
      <Path d="M8 16h.01" />
    </>
  ),
  package: (
    <>
      <Path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
      <Path d="M12 22V12" />
      <Polyline points="3.29 7 12 12 20.71 7" />
      <Path d="m7.5 4.27 9 5.15" />
    </>
  ),
  /** Add product, on Home. */
  'package-plus': (
    <>
      <Path d="M16 16h6" />
      <Path d="M19 13v6" />
      <Path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
      <Path d="m7.5 4.27 9 5.15" />
      <Polyline points="3.29 7 12 12 20.71 7" />
      <Line x1="12" x2="12" y1="22" y2="12" />
    </>
  ),
  truck: (
    <>
      <Path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <Path d="M15 18H9" />
      <Path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <Circle cx="17" cy="18" r="2" />
      <Circle cx="7" cy="18" r="2" />
    </>
  ),
  delivered: (
    <>
      <Path d="m16 16 2 2 4-4" />
      <Path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
      <Path d="m7.5 4.27 9 5.15" />
      <Polyline points="3.29 7 12 12 20.71 7" />
      <Line x1="12" x2="12" y1="22" y2="12" />
    </>
  ),
  // States
  check: <Path d="M20 6 9 17l-5-5" />,
  /** Mark all as read. */
  'check-check': (
    <>
      <Path d="M18 6 7 17l-5-5" />
      <Path d="m22 10-7.5 7.5L13 16" />
    </>
  ),
  'check-circle': (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="m9 12 2 2 4-4" />
    </>
  ),
  warning: (
    <>
      <Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <Path d="M12 9v4" />
      <Path d="M12 17h.01" />
    </>
  ),
  // The business app's own
  'chevrons-up-down': (
    <>
      <Path d="m7 15 5 5 5-5" />
      <Path d="m7 9 5-5 5 5" />
    </>
  ),
  inbox: (
    <>
      <Polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <Path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  'scan-barcode': (
    <>
      <Path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <Path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <Path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <Path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <Path d="M8 7v10" />
      <Path d="M12 7v10" />
      <Path d="M17 7v10" />
    </>
  ),
  boxes: (
    <>
      <Path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
      <Path d="m7 16.5-4.74-2.85" />
      <Path d="m7 16.5 5-3" />
      <Path d="M7 16.5v5.17" />
      <Path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
      <Path d="m17 16.5-5-3" />
      <Path d="m17 16.5 4.74-2.85" />
      <Path d="M17 16.5v5.17" />
      <Path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
      <Path d="M12 8 7.26 5.15" />
      <Path d="m12 8 4.74-2.85" />
      <Path d="M12 13.5V8" />
    </>
  ),
  users: (
    <>
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Path d="M16 3.128a4 4 0 0 1 0 7.744" />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <Circle cx="9" cy="7" r="4" />
    </>
  ),
  key: (
    <>
      <Path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
      <Circle cx="16.5" cy="7.5" r=".5" />
    </>
  ),
  'file-text': (
    <>
      <Path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <Path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <Path d="M10 9H8" />
      <Path d="M16 13H8" />
      <Path d="M16 17H8" />
    </>
  ),
  clock: (
    <>
      <Path d="M12 6v6l4 2" />
      <Circle cx="12" cy="12" r="10" />
    </>
  ),
  /** Lucide's `chart-column`: Home's collection graph, when the store sends none. */
  chart: (
    <>
      <Path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <Path d="M18 17V9" />
      <Path d="M13 17V5" />
      <Path d="M8 17v-3" />
    </>
  ),
  'external-link': (
    <>
      <Path d="M15 3h6v6" />
      <Path d="M10 14 21 3" />
      <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  refresh: (
    <>
      <Path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <Path d="M21 3v5h-5" />
      <Path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <Path d="M8 16H3v5" />
    </>
  ),
  'alert-circle': (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" x2="12" y1="8" y2="12" />
      <Line x1="12" x2="12.01" y1="16" y2="16" />
    </>
  ),
  'x-circle': (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="m15 9-6 6" />
      <Path d="m9 9 6 6" />
    </>
  ),
  'wifi-off': (
    <>
      <Path d="M12 20h.01" />
      <Path d="M8.5 16.429a5 5 0 0 1 7 0" />
      <Path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
      <Path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
      <Path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
      <Path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
      <Path d="m2 2 20 20" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;

/**
 * Icons whose outline is a closed shape, so `filled` gives a solid version
 * (the active tab). Filling any other icon would fill open lines into blots;
 * for those `filled` is ignored.
 */
const FILLABLE = new Set<IconName>(['home', 'user', 'bell', 'tag', 'chat']);

// Gives the SVG a `colorClassName`, so an icon takes its colour from a token.
const TokenSvg = withUniwind(Svg);

/**
 * The token colours an icon can take, each with the class that carries it in
 * the browser preview.
 *
 * On a phone, Uniwind turns the `accent-*` class into the SVG's colour. In a
 * browser it would read that colour out of the stylesheet with JavaScript, and
 * in development the first screen renders before the stylesheet is ready. An
 * SVG takes the text colour by itself there, so the `text-*` class does the
 * job with nothing to read.
 */
const TINTS = {
  'accent-foreground': 'text-foreground',
  'accent-muted': 'text-muted',
  'accent-background': 'text-background',
  'accent-primary': 'text-primary',
  'accent-primary-foreground': 'text-primary-foreground',
  'accent-secondary-foreground': 'text-secondary-foreground',
  'accent-accent': 'text-accent',
  'accent-accent-foreground': 'text-accent-foreground',
  'accent-link': 'text-link',
  'accent-info': 'text-info',
  'accent-success': 'text-success',
  'accent-warning': 'text-warning',
  'accent-danger': 'text-danger',
  'accent-danger-foreground': 'text-danger-foreground',
  'accent-border': 'text-border',
  'accent-on-scrim': 'text-on-scrim',
} as const;

export type IconTint = keyof typeof TINTS;

type IconProps = {
  name: IconName;
  size?: number;
  /** A token, as an `accent-*` class: `accent-muted`. A token new to icons gets a line in `TINTS`. */
  colorClassName?: IconTint;
  /** A colour value, for the few places that hand one over. Wins over `colorClassName`. */
  color?: ColorValue;
  /** Fill the shape with its colour instead of drawing the outline only, where the shape allows it. */
  filled?: boolean;
  /** Turn the icon around in a right-to-left layout: for arrows that point "forward" or "back". */
  directional?: boolean;
  strokeWidth?: number;
};

export function Icon({
  name,
  size = 24,
  colorClassName = 'accent-foreground',
  color,
  filled = false,
  directional = false,
  strokeWidth = 2,
}: IconProps) {
  const shape = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: filled && FILLABLE.has(name) ? 'currentColor' : 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  const onWeb = Platform.OS === 'web';
  const classes = cn(!color && onWeb && TINTS[colorClassName], directional && 'rtl:-scale-x-100');

  // No label of its own: the control the icon sits in carries it.
  return (
    <TokenSvg
      {...shape}
      {...(color ? { color } : onWeb ? null : { colorClassName })}
      {...(classes ? { className: classes } : null)}>
      {ICONS[name]}
    </TokenSvg>
  );
}
