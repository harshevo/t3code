import type { SVGProps } from "react";
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 5c-6-6-14 2-10 8-7 6 0 16 7 12l3 2 3-2c7 4 14-6 7-12 4-6-4-14-10-8Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M16 8v15M10 12l6 4 6-4M10 21l6-5 6 5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
