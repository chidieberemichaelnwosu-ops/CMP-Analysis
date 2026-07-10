/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Helper to replace oklch and oklab colors with HSL colors so html2canvas doesn't crash
export const replaceOklchInCss = (cssText: string): string => {
  const replaceFunc = (text: string, funcName: string): string => {
    let result = "";
    let i = 0;
    const len = text.length;
    const searchStr = funcName + "(";
    const searchLen = searchStr.length;

    while (i < len) {
      const idx = text.indexOf(searchStr, i);
      if (idx === -1) {
        result += text.substring(i);
        break;
      }

      // Add everything before the match
      result += text.substring(i, idx);

      // Find the balanced closing parenthesis
      let parenCount = 1;
      let j = idx + searchLen;
      while (j < len && parenCount > 0) {
        if (text[j] === "(") {
          parenCount++;
        } else if (text[j] === ")") {
          parenCount--;
        }
        j++;
      }

      // Extract the exact contents of the function call (excluding the outer parens)
      const inside = text.substring(idx + searchLen, j - 1);
      
      // Default fallback color (neutral gray)
      let replacedColor = "rgb(120, 120, 120)";

      if (funcName === "oklch") {
        const match = inside.match(/^\s*([0-9.]+%?)\s+([0-9.]+)\s+([-+0-9.a-zdeg%]+)(?:\s*\/\s*([0-9.]+%?))?\s*$/i);
        if (match) {
          const [, l, c, h, a] = match;
          let lightness = l;
          if (!lightness.endsWith("%")) {
            lightness = `${parseFloat(lightness) * 100}%`;
          }
          const chroma = parseFloat(c);
          const saturation = `${Math.min(100, Math.max(0, (chroma / 0.4) * 100))}%`;
          
          let hue = parseFloat(h);
          if (isNaN(hue)) {
            hue = 0;
          } else if (h.includes("rad")) {
            hue = hue * (180 / Math.PI);
          } else if (h.includes("turn")) {
            hue = hue * 360;
          }
          hue = (hue % 360 + 360) % 360;

          if (a) {
            replacedColor = `hsla(${hue.toFixed(1)}, ${saturation}, ${lightness}, ${a})`;
          } else {
            replacedColor = `hsl(${hue.toFixed(1)}, ${saturation}, ${lightness})`;
          }
        }
      } else if (funcName === "oklab") {
        const match = inside.match(/^\s*([0-9.]+%?)\s+([-+0-9.]+)\s+([-+0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*$/i);
        if (match) {
          const [, l, a_val, b_val, alpha] = match;
          let lightness = l;
          if (!lightness.endsWith("%")) {
            lightness = `${parseFloat(lightness) * 100}%`;
          }
          const A = parseFloat(a_val);
          const B = parseFloat(b_val);
          
          const chroma = Math.sqrt(A * A + B * B);
          const hueRad = Math.atan2(B, A);
          let hueDeg = hueRad * (180 / Math.PI);
          hueDeg = (hueDeg % 360 + 360) % 360;

          const saturation = `${Math.min(100, Math.max(0, (chroma / 0.4) * 100))}%`;

          if (alpha) {
            replacedColor = `hsla(${hueDeg.toFixed(1)}, ${saturation}, ${lightness}, ${alpha})`;
          } else {
            replacedColor = `hsl(${hueDeg.toFixed(1)}, ${saturation}, ${lightness})`;
          }
        }
      }

      result += replacedColor;
      i = j;
    }
    return result;
  };

  let cleaned = replaceFunc(cssText, "oklch");
  cleaned = replaceFunc(cleaned, "oklab");
  return cleaned;
};

export const prepareStylesheetsForHtml2Canvas = async () => {
  const originalStyles: { element: HTMLElement; originalText?: string; wasDisabled?: boolean }[] = [];
  const tempStyleElements: HTMLStyleElement[] = [];

  // 1. Process <style> tags
  const styleTags = Array.from(document.querySelectorAll("style"));
  for (const style of styleTags) {
    if (style.innerHTML.includes("oklch") || style.innerHTML.includes("oklab")) {
      const originalText = style.innerHTML;
      const cleanText = replaceOklchInCss(originalText);
      originalStyles.push({ element: style, originalText });
      style.innerHTML = cleanText;
    }
  }

  // 2. Process <link> tags (same origin only)
  const linkTags = Array.from(document.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
  for (const link of linkTags) {
    try {
      if (link.href) {
        const url = new URL(link.href, window.location.href);
        if (url.origin === window.location.origin) {
          const response = await fetch(link.href);
          const cssText = await response.text();
          if (cssText.includes("oklch") || cssText.includes("oklab")) {
            const cleanText = replaceOklchInCss(cssText);
            const tempStyle = document.createElement("style");
            tempStyle.setAttribute("data-temp-html2canvas", "true");
            tempStyle.innerHTML = cleanText;
            document.head.appendChild(tempStyle);
            tempStyleElements.push(tempStyle);

            originalStyles.push({ element: link, wasDisabled: link.disabled });
            link.disabled = true;
          }
        }
      }
    } catch (e) {
      console.warn("Could not process stylesheet link:", link.href, e);
    }
  }

  return () => {
    // Restore style tags
    for (const item of originalStyles) {
      if (item.element.tagName === "STYLE" && item.originalText !== undefined) {
        item.element.innerHTML = item.originalText;
      } else if (item.element.tagName === "LINK" && item.wasDisabled !== undefined) {
        (item.element as HTMLLinkElement).disabled = item.wasDisabled;
      }
    }
    // Remove temporary style elements
    for (const temp of tempStyleElements) {
      if (temp.parentNode) {
        temp.parentNode.removeChild(temp);
      }
    }
  };
};
