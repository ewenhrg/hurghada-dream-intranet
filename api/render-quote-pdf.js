import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
      return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const html = String(body?.html || "");
    if (!html || html.length < 100) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Missing html" }));
      return;
    }
    if (html.length > 350_000) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "HTML too large" }));
      return;
    }

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: ["load", "networkidle0"] });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      });

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, pdfBase64: Buffer.from(pdf).toString("base64") }));
    } finally {
      await browser.close();
    }
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}

