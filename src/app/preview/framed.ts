import { headers } from "next/headers";

/**
 * True when the browser loads this page inside a frame, such as a picture on
 * the admin map (KTD6): browsers send `Sec-Fetch-Dest: iframe` for a framed
 * document. A client navigation inside the frame sends no such header, so the
 * page bar checks the window as well. Request-time data: call it only on the
 * preview pages, which already render on every request.
 */
export async function isFramedRequest(): Promise<boolean> {
  return (await headers()).get("sec-fetch-dest") === "iframe";
}
