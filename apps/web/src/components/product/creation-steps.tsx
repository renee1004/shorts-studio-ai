export function CreationSteps({ current = 1 }: { current?: 1 | 2 | 3 }) {
  return (
    <ol aria-label="영상 제작 순서" className="grid grid-cols-3 gap-2 text-sm">
      {["대본 준비", "장면 준비", "영상 만들기"].map((label, index) => (
        <li
          key={label}
          aria-current={index + 1 === current ? "step" : undefined}
          className={`rounded-xl px-3 py-3 ${index + 1 === current ? "bg-primary/10 font-semibold text-primary" : "bg-muted text-muted-foreground"}`}
        >
          <span className="mr-2">{index + 1 < current ? "✓" : index + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
