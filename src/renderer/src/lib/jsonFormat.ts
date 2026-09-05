export function formatJson(text: string): string {
  // Parsing validates only; format the original tokens to preserve large numbers.
  JSON.parse(text);
  let output = "",
    depth = 0,
    quoted = false,
    escaped = false;
  const newline = () => {
    output += "\n" + "  ".repeat(depth);
  };
  for (const char of text) {
    if (quoted) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') {
      quoted = true;
      output += char;
    } else if (char === "{" || char === "[") {
      output += char;
      depth++;
      newline();
    } else if (char === "}" || char === "]") {
      depth--;
      newline();
      output += char;
    } else if (char === ",") {
      output += char;
      newline();
    } else if (char === ":") output += ": ";
    else if (!/\s/.test(char)) output += char;
  }
  return output;
}
