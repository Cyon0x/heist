/** Canvas palette. Kept in lockstep with the CSS tokens in globals.css. */
export const C = {
  void: "#080b10",
  voidHatch: "#0d131b",
  floor: "#0f1620",
  floorAlt: "#121b26",
  /* The remembered pass. Bright enough to navigate by, dim enough that the lit
     cone still reads as "you can see this properly now". */
  floorDim: "#16212e",
  wallDim: "#2a3a4d",
  wallTopDim: "#3b5170",
  wallEdgeDim: "#5b7899",
  grid: "#17222f",
  wall: "#1b2735",
  wallTop: "#2c3b4e",
  wallEdge: "#46617f",
  roomEdge: "#24384f",
  label: "#4a5b70",
  amber: "#ffa227",
  amberDim: "#8a5a1a",
  amberSoft: "rgba(255,162,39,0.14)",
  cyan: "#6fd8e8",
  cyanDim: "#2c6b76",
  cyanSoft: "rgba(111,216,232,0.14)",
  red: "#ff4d5e",
  redSoft: "rgba(255,77,94,0.16)",
  ink: "#e8edf5",
} as const;
