/**
 * CSV Element Parser Types
 * For importing door elements from PDF annotation CSV exports
 */

export interface CSVRow {
  ID: string;
  Parent: string;
  Subject: string;
  'Page Label': string;
  Comments: string;
  Author: string;
  Date: string;
  Status: string;
  Color: string;
  Layer: string;
  Space: string;
  GroupID: string;
  'Page Index': string;
  Lock: string;
  Checkmark: string;
  'Creation Date': string;
  X: string;
  Y: string;
  'X Center': string;
  'Y Center': string;
  'Document Width': string;
  'Document Height': string;
  Length: string;
  'Length Unit': string;
  Width: string;
  'Width Unit': string;
  Height: string;
  'Height Unit': string;
  'Rise/Drop': string;
  'Rise/Drop Unit': string;
  Unit: string;
  Area: string;
  'Area Unit': string;
  'Wall Area': string;
  'Wall Area Unit': string;
  Depth: string;
  'Depth Unit': string;
  Volume: string;
  'Volume Unit': string;
  Count: string;
  Measurement: string;
  'Measurement Unit': string;
  Label: string;
  Capture: string;
  'File Name': string;
}

export interface DoorGroup {
  groupId: string;
  pageNumber: number;
  pageLabel: string;
  label: string; // Door label from CSV
  rectangle?: Rectangle;
  measurements: Measurement[];
}

export interface Rectangle {
  x: number; // inches
  y: number; // inches
  width: number; // inches
  height: number; // inches
}

export interface Measurement {
  subject: string; // e.g., "Front, pull", "Front, push"
  value: number; // inches
  label: string; // e.g., "Perpend.", "Width"
}

export interface ParsedDoor {
  groupId: string;
  pageNumber: number;
  instanceLabel: string;
  boundingBox: {
    x: number; // PDF points
    y: number; // PDF points
    width: number; // PDF points
    height: number; // PDF points
  };
  measurements: {
    frontPull?: number;
    frontPush?: number;
    pullLatch?: number;
    pushLatch?: number;
    hingePush?: number;
    width?: number;
  };
}
