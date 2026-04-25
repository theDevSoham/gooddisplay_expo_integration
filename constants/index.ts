import { DisplayConfig } from "@/types";

// ─── Display Configurations ───────────────────────────────────────────────────
// Based on Section 4.2 and Table 5-1 of the FMSC ESL User Development Manual

export const DISPLAY_CONFIGS: Record<string, DisplayConfig> = {
  "2.13-bw": {
    size: "2.13",
    color: "bw",
    width: 122,
    height: 250,
    manufacturerByte: "F0", // custom driver per manual section 7.9.3.1
    sizeByte: "00", // (0000)b = 2.13 inch, pixel variant (0000)b = 122x250
    colorByte: "20", // 0x20 = black and white per Table 4-2
  },
  "2.13-bwr": {
    size: "2.13",
    color: "bwr",
    width: 122,
    height: 250,
    manufacturerByte: "F0",
    sizeByte: "00",
    colorByte: "30", // 0x30 = black, white and red
  },
};

// Default to the 2.13" black and white module (GDN0213BW)
export const DEFAULT_DISPLAY = DISPLAY_CONFIGS["2.13-bw"];

// ─── APDU Command Constants ───────────────────────────────────────────────────
// Ref: Section 7 of the FMSC ESL User Development Manual

export const CLA = {
  STANDARD: 0x00,
  PROPRIETARY: 0xf0,
  CHANGE_PIN: 0x80,
} as const;

export const INS = {
  GET_RND: 0x84,
  VERIFY_PIN: 0x20,
  CHANGE_PIN: 0xd9,
  GET_CONFIG_INFO: 0xd1,
  LOAD_IMAGE: 0xd2,
  LOAD_COMPRESSED_IMAGE: 0xd3,
  REDRAW_SCREEN: 0xd4,
  GET_IMAGE_SN: 0xd5,
  SET_SCREEN_TYPE: 0xda,
  SET_DRIVER_FLOW: 0xdb,
  GET_EPD_INFO: 0xdc,
  GET_EPD_BUSY_STATUS: 0xde,
  WRITE_DATA: 0xd7,
  READ_DATA: 0xd8,
} as const;

// NDEF Application select AID (Section 6)
export const NDEF_AID = [0xd2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00];

// Status words
export const SW = {
  SUCCESS: [0x90, 0x00],
  BUSY: 0x01,
  IDLE: 0x00,
} as const;

// ─── Transfer Constants ───────────────────────────────────────────────────────

/** Max data bytes per D2 packet per the manual (Section 7.5) */
export const IMAGE_PACKET_SIZE = 250;

/** Default PIN per Section 7.2.1 */
export const DEFAULT_PIN = [0x11, 0x22, 0x33, 0x44, 0x55];

/** Poll interval when waiting for screen refresh (ms) */
export const BUSY_POLL_INTERVAL_MS = 1000;

/** Max time to wait for screen refresh (ms) - manual recommends ~30s default */
export const REFRESH_TIMEOUT_MS = 35_000;

/** Screen power-on delay units (P1 * 100ms). 0 = no delay / battery mode */
export const SCREEN_POWER_ON_DELAY = 0x00;
