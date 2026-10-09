// A JPEG test fixture with GPS data (U6: "an uploaded JPEG that carries GPS
// EXIF data is stored with no GPS data"). withGpsExif() puts an EXIF APP1
// segment with a GPS position (40 deg 36' N, 75 deg 22' W) into a plain JPEG;
// exifSegments() finds EXIF segments in a JPEG, so a test can show that the
// fixture has GPS data and the stored file has none.

const GPS_INFO_TAG = 0x8825;

function u16(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(value);
  return b;
}

function u32(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value);
  return b;
}

/** One IFD entry: tag, type, count, and a 4-byte value or offset. */
function entry(tag: number, type: number, count: number, value: Buffer): Buffer {
  return Buffer.concat([u16(tag), u16(type), u32(count), Buffer.concat([value, Buffer.alloc(4)]).subarray(0, 4)]);
}

function rationals(values: [number, number][]): Buffer {
  return Buffer.concat(values.flatMap(([n, d]) => [u32(n), u32(d)]));
}

/** The TIFF body of the EXIF segment: IFD0 with a GPS IFD pointer, then the GPS IFD. */
function gpsTiff(): Buffer {
  const header = Buffer.concat([Buffer.from("MM"), u16(42), u32(8)]);
  const gpsIfdOffset = 8 + 2 + 12 + 4; // 26
  const ifd0 = Buffer.concat([u16(1), entry(GPS_INFO_TAG, 4, 1, u32(gpsIfdOffset)), u32(0)]);
  const entries = 5;
  const dataOffset = gpsIfdOffset + 2 + entries * 12 + 4; // 92
  const latitude = rationals([
    [40, 1],
    [36, 1],
    [1234, 100],
  ]);
  const longitude = rationals([
    [75, 1],
    [22, 1],
    [5678, 100],
  ]);
  const gpsIfd = Buffer.concat([
    u16(entries),
    entry(0x0000, 1, 4, Buffer.from([2, 3, 0, 0])), // GPSVersionID
    entry(0x0001, 2, 2, Buffer.from("N\0")), // GPSLatitudeRef
    entry(0x0002, 5, 3, u32(dataOffset)), // GPSLatitude
    entry(0x0003, 2, 2, Buffer.from("W\0")), // GPSLongitudeRef
    entry(0x0004, 5, 3, u32(dataOffset + latitude.length)), // GPSLongitude
    u32(0),
  ]);
  return Buffer.concat([header, ifd0, gpsIfd, latitude, longitude]);
}

/** The JPEG with an EXIF APP1 segment that holds a GPS position, right after the SOI marker. */
export function withGpsExif(jpeg: Buffer): Buffer {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("Not a JPEG");
  const body = Buffer.concat([Buffer.from("Exif\0\0"), gpsTiff()]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), u16(body.length + 2), body]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

/** The EXIF APP1 segments of a JPEG (the segments before the image data). */
export function exifSegments(jpeg: Buffer): Buffer[] {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("Not a JPEG");
  const found: Buffer[] = [];
  let at = 2;
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff) {
    const marker = jpeg[at + 1];
    if (marker === 0xda || marker === 0xd9) break; // start of scan, end of image
    const length = jpeg.readUInt16BE(at + 2);
    const segment = jpeg.subarray(at + 4, at + 2 + length);
    if (marker === 0xe1 && segment.subarray(0, 6).equals(Buffer.from("Exif\0\0"))) found.push(segment);
    at += 2 + length;
  }
  return found;
}

/** True when an EXIF segment of the JPEG has a GPS IFD pointer. */
export function hasGps(jpeg: Buffer): boolean {
  return exifSegments(jpeg).some((segment) => segment.includes(u16(GPS_INFO_TAG)));
}
