import type { SoldComp } from '../types.js';
/**
 * Parse the HTML returned by POST back.130point.com/sales/ into sold rows.
 * Row anatomy (one <tr> per sale):
 *   #titleText a          → listing title + eBay URL
 *   #auctionLabel         → "Fixed Price" | "Best Offer Accepted" | "Auction" …
 *   div#dataCol[data-price][data-currency] → canonical numeric sale price
 *   #dateText             → "Date: Mon 17 Aug 2026 01:16:52 GMT"
 */
export declare function parse130PointSales(html: string): SoldComp[];
