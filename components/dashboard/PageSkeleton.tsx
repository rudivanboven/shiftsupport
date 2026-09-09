import { Panel, Skeleton, StatGrid } from "@/components/ui/Kit";

/** Shown while a dashboard page's data is being fetched on the server. */
export default function PageSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading…</span>

      <div style={{ marginBottom: 28, display: "grid", gap: 12 }}>
        <Skeleton height={14} width={120} />
        <Skeleton height={38} width="min(420px, 70%)" />
        <Skeleton height={16} width="min(560px, 90%)" />
      </div>

      <StatGrid>
        {Array.from({ length: stats }).map((_, index) => (
          <div
            key={index}
            style={{
              padding: 20,
              border: "1px solid var(--line)",
              borderRadius: 20,
              background: "var(--surface)",
              display: "grid",
              gap: 14,
            }}
          >
            <Skeleton height={34} width={34} radius={11} />
            <Skeleton height={30} width="55%" />
            <Skeleton height={12} width="75%" />
          </div>
        ))}
      </StatGrid>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 18,
        }}
      >
        {[0, 1].map((index) => (
          <Panel key={index}>
            <div style={{ display: "grid", gap: 14 }}>
              <Skeleton height={18} width="45%" />
              <Skeleton height={12} width="80%" />
              <Skeleton height={110} radius={16} />
              <Skeleton height={110} radius={16} />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
