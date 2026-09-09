"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./HowShiftsWork.module.css";

const steps = [
  {
    number: "01",
    label: "Retailers",
    title: "Post A Short Shift",
    text: "Request the help you need through ShiftSupport and define the exact time, location, and work required.",
  },
  {
    number: "02",
    label: "Workers",
    title: "Pick A Shift That Fits",
    text: "Browse available opportunities and choose short shifts that fit your schedule, especially after school or on weekends.",
  },
  {
    number: "03",
    label: "Shift Tasks",
    title: "Simple Retail Support",
    text: "Workers can help with stocking and organizing, light cleaning, store resets, customer assistance during busy hours, and basic back-of-house support.",
  },
];

export default function HowShiftsWork() {
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [activeStep, setActiveStep] = useState(-1);
  // Until the observer is wired up (and for no-JS / reduced motion) the steps
  // render in their finished state, so the content is never left dimmed.
  const [enhanced, setEnhanced] = useState(false);

  useEffect(() => {
    const nodes = itemRefs.current.filter(Boolean) as HTMLLIElement[];
    if (nodes.length === 0) return;

    // No observer support, or the visitor asked for reduced motion: skip the
    // progressive reveal and present the finished state straight away.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof IntersectionObserver === "undefined" || reduced) {
      setActiveStep(steps.length - 1);
      return;
    }

    // A step counts as active once it crosses a narrow band at the middle of
    // the viewport, so the line fills roughly in step with the reading position.
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = nodes.indexOf(entry.target as HTMLLIElement);
          if (index === -1) continue;
          if (entry.isIntersecting) visible.add(index);
          else visible.delete(index);
        }
        setActiveStep((prev) =>
          visible.size > 0 ? Math.max(...visible) : prev,
        );
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );

    nodes.forEach((node) => observer.observe(node));
    setEnhanced(true);
    return () => observer.disconnect();
  }, []);

  const progress = !enhanced
    ? 100
    : activeStep < 0
      ? 0
      : ((activeStep + 1) / steps.length) * 100;

  return (
    <section className={styles.section} id="how-shifts-work">
      <div className={styles.decor} aria-hidden="true">
        <span className={styles.arcOne} />
        <span className={styles.arcTwo} />
      </div>

      <div className={`container ${styles.inner}`}>
        <div className={styles.intro}>
          <p className={`headingFont ${styles.eyebrow}`}>
            <span className={styles.eyebrowLine} aria-hidden="true" />
            How Shifts Work
          </p>

          <h2 className={styles.heading}>
            How Shifts
            <br />
            Work
          </h2>

          <p className={styles.lede}>
            Three simple steps. One
            <br />
            smoother store.
          </p>
        </div>

        <ol className={`${styles.timeline} ${enhanced ? styles.timelineJs : ""}`}>
          <span className={styles.track} aria-hidden="true">
            <span className={styles.trackFill} style={{ height: `${progress}%` }} />
          </span>

          {steps.map((step, index) => (
            <li
              key={step.number}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className={`${styles.step} ${index <= activeStep ? styles.stepActive : ""}`}
            >
              <div className={styles.marker}>
                <span className={`headingFont ${styles.number}`}>{step.number}</span>
                <span className={`headingFont ${styles.label}`}>{step.label}</span>
              </div>

              <span className={styles.spacer} aria-hidden="true" />

              <div className={styles.content}>
                <h3 className={styles.title}>{step.title}</h3>
                <p className={styles.text}>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
