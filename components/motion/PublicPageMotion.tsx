"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import FloatingQrCard from "@/components/layout/FloatingQrCard/FloatingQrCard";

const PUBLIC_ROUTES = new Set([
  "/",
  "/about",
  "/contact",
  "/how-it-works",
  "/how-shifts-work",
  "/workers",
  "/retailers",
]);

export default function PublicPageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const enabled = PUBLIC_ROUTES.has(pathname);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sections = Array.from(
      root.querySelectorAll<HTMLElement>("main section, main > .container"),
    );
    const hero = root.querySelector<HTMLElement>("main section");

    if (reducedMotion || typeof IntersectionObserver === "undefined") {
      sections.forEach((section) => section.classList.add("public-motion-visible"));
      return;
    }

    sections.forEach((section) => section.classList.add("public-motion-reveal"));

    if (hero) {
      hero.classList.add("public-motion-hero");
      const heroItems = Array.from(
        hero.querySelectorAll<HTMLElement>("h1, h2, p, a, button, img"),
      ).slice(0, 9);
      heroItems.forEach((item, index) => {
        item.classList.add("public-motion-hero-item");
        item.style.setProperty("--public-motion-order", String(index));
      });
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("public-motion-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );

    sections.forEach((section) => observer.observe(section));

    let frame = 0;
    const updateParallax = () => {
      frame = 0;
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const progress = Math.max(-1, Math.min(1, -rect.top / Math.max(rect.height, 1)));
      hero.style.setProperty("--public-parallax-y", `${progress * 12}px`);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateParallax);
    };

    updateParallax();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled, pathname]);

  if (!enabled) return children;

  return (
    <div className="public-motion-root" ref={rootRef} key={pathname}>
      {children}
      <FloatingQrCard />
    </div>
  );
}
