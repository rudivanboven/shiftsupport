"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Positioning.module.css";

const iconPaths: Record<string, ReactNode> = {
  people: (
    <>
      <circle cx="8.8" cy="8" r="3" />
      <circle cx="16.2" cy="8.8" r="2.5" />
      <path d="M3.8 19a5.1 5.1 0 0 1 10 0" />
      <path d="M13.8 18.7a4.2 4.2 0 0 1 6.4 0" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 5.6 5.8v5.1c0 4 2.6 7.4 6.4 8.5 3.8-1.1 6.4-4.5 6.4-8.5V5.8L12 3.2Z" />
      <path d="m9.2 11.8 1.9 1.9 3.8-3.9" />
    </>
  ),
  store: (
    <>
      <path d="M4 9.2 5.5 4.8h13L20 9.2" />
      <path d="M5 9.2v9.9h14V9.2" />
      <path d="M8.2 19.1v-5.4h7.6v5.4" />
      <path d="M3.8 9.2h16.4" />
    </>
  ),
};

const features = [
  {
    icon: "people",
    title: "Local",
    subtitle: "Stronger Communities",
  },
  {
    icon: "shield",
    title: "Reliable",
    subtitle: "Trusted Support",
  },
  {
    icon: "store",
    title: "Ready",
    subtitle: "Help When You Need It",
  },
];

function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name]}
    </svg>
  );
}

export default function Positioning() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof IntersectionObserver === "undefined" || reduced) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`${styles.section} ${inView ? styles.inView : ""}`}
    >
      <div className={styles.backdrop} aria-hidden="true">
        <span className={`${styles.glow} ${styles.glowOne}`} />
        <span className={`${styles.glow} ${styles.glowTwo}`} />
        <span className={`${styles.glow} ${styles.glowThree}`} />
      </div>

      <div className="container">
        <div className={styles.panel}>
          <div className={styles.background} aria-hidden="true" />
          <div className={styles.overlay} aria-hidden="true" />

          <span className={`${styles.badge} ${styles.badgeLeft}`}>
            <span />
            REAL PEOPLE
          </span>
          <span className={`${styles.badge} ${styles.badgeTop}`}>
            <span />
            LOCAL BUSINESSES
          </span>
          <span className={`${styles.badge} ${styles.badgeBottom}`}>
            <span />
            BRIGHTER FUTURES
          </span>

          <span className={`${styles.accentMark} ${styles.accentLeft}`} />
          <span className={`${styles.accentMark} ${styles.accentTop}`} />
          <span className={`${styles.crossMark} ${styles.accentBottom}`} />

          <div className={styles.content}>
            <img
              className={styles.logo}
              src="/images/whitelogo.png"
              alt="ShiftSupport"
            />

            <h2 className={styles.heading}>
              Supporting Local Businesses
              <br />
              with <span>Reliable</span> Staffing.
            </h2>

            <p className={styles.description}>
              ShiftSupport operates like a modern staffing agency for short
              retail shifts. We are the employer, we handle payroll, insurance,
              and compliance, and local businesses get extra help without taking
              on hiring risk.
            </p>

            <ul className={styles.features}>
              {features.map((feature) => (
                <li className={styles.feature} key={feature.title}>
                  <span className={styles.iconCircle}>
                    <Icon name={feature.icon} />
                  </span>
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.subtitle}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
