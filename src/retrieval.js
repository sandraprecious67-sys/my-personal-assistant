function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{2,}/gu) || [];
}

function searchFiles(files, query, limit = 8) {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];

  return files
    .map((file) => {
      const tokens = tokenize(file.content);
      const counts = new Map();
      for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
      const score = terms.reduce((total, term) => total + (counts.get(term) || 0), 0);
      if (!score) return null;

      const firstMatch = file.content.toLowerCase().indexOf(terms[0]);
      const start = Math.max(0, (firstMatch < 0 ? 0 : firstMatch) - 180);
      const end = Math.min(file.content.length, start + 500);
      return {
        id: file.id,
        name: file.name,
        score,
        snippet: `${start ? "…" : ""}${file.content.slice(start, end).trim()}${end < file.content.length ? "…" : ""}`
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = { searchFiles };
