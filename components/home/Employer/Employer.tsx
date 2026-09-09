"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import styles from "./Employer.module.css";

/* Inline stroke icons — no package, no external assets. */
const paths: Record<string, ReactNode> = {
  hiring: (
    <>
      <circle cx="9.5" cy="7.6" r="3.4" />
      <path d="M3.6 19.4a5.9 5.9 0 0 1 11.8 0" />
      <path d="m16.6 12.6 1.7 1.7 3.3-3.3" />
    </>
  ),
  payroll: (
    <>
      <rect x="2.8" y="6.2" width="18.4" height="11.6" rx="2.2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.4 9.8h.01M17.6 14.2h.01" />
    </>
  ),
  comp: (
    <>
      <path d="M12 3.2 5.5 5.8v5c0 4.2 2.7 7.6 6.5 8.6 3.8-1 6.5-4.4 6.5-8.6v-5L12 3.2Z" />
      <path d="m9.3 11.9 1.9 1.9 3.6-3.6" />
    </>
  ),
  compliance: (
    <>
      <path d="M9 4.4H7.4a1.8 1.8 0 0 0-1.8 1.8v12.2a1.8 1.8 0 0 0 1.8 1.8h9.2a1.8 1.8 0 0 0 1.8-1.8V6.2a1.8 1.8 0 0 0-1.8-1.8H15" />
      <rect x="9" y="2.8" width="6" height="3.2" rx="1.1" />
      <path d="m8.9 13.4 1.7 1.7 3.5-3.5" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

const features = [
  [
    "hiring",
    "Hiring & Onboarding",
    "ShiftSupport handles worker hiring and onboarding from start to finish.",
  ],
  [
    "payroll",
    "Payroll & Taxes",
    "ShiftSupport manages payroll and payroll taxes, so retailers don’t have to.",
  ],
  [
    "comp",
    "Workers’ Compensation",
    "Workers are covered through ShiftSupport’s workers’ compensation insurance.",
  ],
  [
    "compliance",
    "Employment Compliance",
    "ShiftSupport manages employment and youth-worker compliance requirements.",
  ],
];

export default function Employer() {
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
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`${styles.section} ${inView ? styles.inView : ""}`}
      id="employer"
    >
      {/* --- background graphics, always behind the content --- */}
      <div className={styles.decor} aria-hidden="true">
        <span className={styles.centreGlow} />
        <svg className={styles.curve} viewBox="0 0 1200 260" fill="none">
          <path
            d="M40 190C250 60 430 40 600 96c170 56 350 40 560-92"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="7 10"
            strokeLinecap="round"
          />
        </svg>

        {/* left cluster */}
        <span className={`${styles.circle} ${styles.lc1}`} />
        <span className={`${styles.circle} ${styles.lc2}`} />
        <span className={`${styles.circle} ${styles.lc3}`} />
        <span className={`${styles.circle} ${styles.lc4}`} />
        <span className={`${styles.markCross} ${styles.lm1}`} />
        <span className={`${styles.markLines} ${styles.lm2}`} />

        {/* right cluster */}
        <span className={`${styles.circle} ${styles.rc1}`} />
        <span className={`${styles.circle} ${styles.rc2}`} />
        <span className={`${styles.circle} ${styles.rc3}`} />
        <span className={`${styles.circle} ${styles.rc4}`} />
        <span className={`${styles.markLines} ${styles.rm1}`} />
        <span className={`${styles.markCross} ${styles.rm2}`} />

        {/* top-right cluster, sitting just under the marquee */}
        <span className={`${styles.circle} ${styles.tc1}`} />
        <span className={`${styles.circle} ${styles.tc2}`} />
        <span className={`${styles.circle} ${styles.tc3}`} />
        <span className={`${styles.circle} ${styles.tc4}`} />
        <span className={`${styles.markCross} ${styles.tm1}`} />
        <span className={`${styles.markLines} ${styles.tm2}`} />
      </div>

      <div className={`container ${styles.inner}`}>
        {/* ---------- centred intro ---------- */}
        <div className={styles.intro}>
          <p className={`headingFont ${styles.eyebrow}`}>
            <span className={styles.eyebrowLine} aria-hidden="true" />
            Employment Made Simple
            <span className={styles.eyebrowLine} aria-hidden="true" />
          </p>

          <h2 className={styles.heading}>
            Who <span className={styles.accent}>Employs</span> the Workers?
          </h2>

          <p className={styles.statement}>ShiftSupport Is the Employer.</p>

          <p className={styles.description}>
            All workers provided through ShiftSupport are W-2 employees of
            ShiftSupport, LLC. They are not independent contractors or employees
            of the retailer.
          </p>
        </div>

        {/* ---------- three-image editorial composition ---------- */}
        <div className={styles.composition}>
          <div className={`${styles.sideWrap} ${styles.leftWrap}`}>
            <figure className={`${styles.side} ${styles.tiltLeft}`}>
              <Image
                className={styles.img}
                src="/images/ededd.png"
                alt="A young retail worker bagging goods behind the counter of a local store"
                fill
                sizes="(max-width: 991px) 90vw, 22vw"
              />
            </figure>
            <p className={`headingFont ${styles.pill} ${styles.pillLeft}`}>
              <span className={styles.dot} aria-hidden="true" />
              Real opportunities for bright futures
            </p>
          </div>

          <div className={styles.centreWrap}>
            <figure className={styles.centre}>
              <Image
                className={styles.img}
                src="/images/fff.png"
                alt="A student worker shaking hands with a local retailer inside a store"
                fill
                sizes="(max-width: 991px) 92vw, 46vw"
                priority={false}
              />
            </figure>
            <p className={`headingFont ${styles.pill} ${styles.pillTop}`}>
              <span className={styles.dot} aria-hidden="true" />
              Local · Reliable · Ready
            </p>
            <p className={`headingFont ${styles.pill} ${styles.pillBottom}`}>
              <span className={styles.dot} aria-hidden="true" />
              Your local help, right when you need it.
            </p>
          </div>

          <div className={`${styles.sideWrap} ${styles.rightWrap}`}>
            <figure className={`${styles.side} ${styles.tiltRight}`}>
              <Image
                className={styles.img}
                src="/images/tg.png"
                alt="A local shop owner standing among the shelves of their store"
                fill
                sizes="(max-width: 991px) 90vw, 22vw"
              />
            </figure>
            <p className={`headingFont ${styles.pill} ${styles.pillRight}`}>
              <span className={styles.dot} aria-hidden="true" />
              Supported at every step
            </p>
          </div>
        </div>

        {/* ---------- four benefits in one row ---------- */}
        <ul className={styles.features}>
          {features.map(([icon, title, text]) => (
            <li className={styles.feature} key={title}>
              <div className={styles.featureHead}>
                <span className={styles.featureIcon}>
                  <Icon name={icon} />
                </span>
                <h3 className={styles.featureTitle}>{title}</h3>
              </div>
              <p className={styles.featureText}>{text}</p>
            </li>
          ))}
        </ul>

        <p className={styles.note}>
          <strong className={styles.noteLead}>
            Retailers are not the employer.
          </strong>{" "}
          Retailers never pay workers directly or take on payroll, tax, or
          worker-classification responsibilities.
        </p>
      </div>
    </section>
  );
}
