// The copilot's prompts ask it to use **bold** for key numbers/recommendations.
// Rendered as real bold here instead of stripping it, so the emphasis survives
// without showing the reader literal asterisks.
export function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}
