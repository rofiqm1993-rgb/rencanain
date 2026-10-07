"use client";

import { useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/** Presentation only. No application state, requests, or persistence. */
export default function VisualMotion({ children, routeKey, entry = false, className = "", id }: {
  children: ReactNode; routeKey: string; entry?: boolean; className?: string; id?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const targets = scope.current?.querySelectorAll(entry ? ".entry-hero h1, .entry-hero > p, .login-story, .auth-panel" : ".page-heading, .clarification-panel > h1, .composer");
      if (targets?.length) gsap.from(targets, { y: 12, opacity: 0.75, duration: 0.5, stagger: 0.07, ease: "power2.out", clearProps: "transform,opacity" });
      if (!entry) return;
      gsap.from(".product-showcase", { y: 24, opacity: 0.7, duration: 0.8, ease: "power2.out", clearProps: "transform,opacity", scrollTrigger: { trigger: ".product-showcase", start: "top 92%", once: true } });
      gsap.from(".feature-visual", { y: 16, opacity: 0.65, duration: 0.6, stagger: 0.1, ease: "power2.out", clearProps: "transform,opacity", scrollTrigger: { trigger: ".guide-cards", start: "top 88%", once: true } });
      const words = scope.current?.querySelectorAll(".scroll-copy span");
      if (words?.length) gsap.from(words, { opacity: 0.55, stagger: 0.08, ease: "none", scrollTrigger: { trigger: ".entry-guide", start: "top 85%", end: "top 40%", scrub: 0.4 } });
    });

    return () => media.revert();
  }, { scope, dependencies: [routeKey, entry], revertOnUpdate: true });
  return <div ref={scope} id={id} className={className}>{children}</div>;
}
