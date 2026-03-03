const cardStyle = {
  flex: 1,
  padding: 24,
  borderRadius: 8,
  backgroundColor: "#fff",
  border: "1px solid #eee",
  textDecoration: "none" as const,
  color: "inherit" as const,
};

export function Footer() {
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
      <a href="https://workos.com/docs" rel="noreferrer" target="_blank" style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Documentation</h3>
        <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
          View integration guides and SDK documentation.
        </p>
      </a>
      <a href="https://workos.com/docs/reference" rel="noreferrer" target="_blank" style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>API Reference</h3>
        <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
          Every WorkOS API method and endpoint documented.
        </p>
      </a>
      <a href="https://workos.com" rel="noreferrer" target="_blank" style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>WorkOS</h3>
        <p style={{ margin: 0, color: "#666", fontSize: 14 }}>
          Learn more about other WorkOS products.
        </p>
      </a>
    </div>
  );
}
