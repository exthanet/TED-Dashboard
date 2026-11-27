// "360°" with an orbit, all in the text colour (currentColor): white on the black menu,
// dark on the light one. Sized in em so it sits on the line of text
// beside it ("360 Insights" in the menu and the phone header).
export function Mark360({ className = "" }: { className?: string }) {
  return (
    <svg className={`mark-360 ${className}`} viewBox="0 0 46 24" aria-hidden="true">
      <path d="M41.5 6.2C36 1.6 15 1.2 6.5 6.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.6 9.6C1.2 14.8 8 21.2 23 21.2c10 0 17.5-3 19.6-8.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M39.4 13.6 43 10.2l1.4 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="22" y="16.6" textAnchor="middle" fontWeight="800" fontSize="13" fill="currentColor" letterSpacing="-0.3">
        360
      </text>
      <circle cx="34.6" cy="6.4" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}
