"use client";

import { useEffect, type ReactNode } from "react";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import styles from "./page.module.css";

const points = {
  workers: ["Short shifts", "Flexible opportunities", "Local work"],
  retailers: [
    "Peak-hour support",
    "Last-minute coverage",
    "No long-term staffing commitment",
  ],
};

const processSteps = [
  {
    number: "01",
    title: "Retailer Needs Help",
    text: "A local business requests short-term staffing support.",
  },
  {
    number: "02",
    title: "ShiftSupport Handles It",
    text: "We manage the employment structure, payroll, insurance, and compliance.",
  },
  {
    number: "03",
    title: "Worker Gets Opportunity",
    text: "A local worker gets access to a flexible shift that fits their life.",
  },
];

const differentiators = [
  [
    "01",
    "W-2 Employment",
    "Workers provided through ShiftSupport are employed by ShiftSupport.",
  ],
  [
    "02",
    "Payroll & Taxes",
    "We handle payroll and the associated employment responsibilities.",
  ],
  [
    "03",
    "Coverage & Protection",
    "Workers are supported through the appropriate employment and insurance structure.",
  ],
  [
    "04",
    "Compliance",
    "We manage the employment and youth-worker compliance requirements behind the shift.",
  ],
];

const iconPaths: Record<string, ReactNode> = {
  people: (
    <>
      <circle cx="8.8" cy="8" r="3" />
      <circle cx="16.2" cy="8.8" r="2.5" />
      <path d="M3.8 19a5.1 5.1 0 0 1 10 0" />
      <path d="M13.8 18.7a4.2 4.2 0 0 1 6.4 0" />
    </>
  ),
  store: (
    <>
      <path d="M4 9.2 5.5 4.8h13L20 9.2" />
      <path d="M5 9.2v9.9h14V9.2" />
      <path d="M8.3 19.1v-5.4h7.4v5.4" />
      <path d="M3.8 9.2h16.4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 5.6 5.8v5.1c0 4 2.6 7.4 6.4 8.5 3.8-1.1 6.4-4.5 6.4-8.5V5.8L12 3.2Z" />
      <path d="m9.2 11.8 1.9 1.9 3.8-3.9" />
    </>
  ),
  link: (
    <>
      <path d="M9.7 14.3 14.3 9.7" />
      <path d="M8.8 10.5 7.4 12a3.2 3.2 0 0 0 4.6 4.6l1.5-1.4" />
      <path d="m10.5 8.8 1.5-1.4a3.2 3.2 0 0 1 4.6 4.6l-1.4 1.5" />
    </>
  ),
};

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

function Eyebrow({
  children,
  light = false,
}: {
  children: string;
  light?: boolean;
}) {
  return (
    <p
      className={`headingFont ${styles.eyebrow} ${light ? styles.lightEyebrow : ""}`}
    >
      <span aria-hidden="true" />
      {children}
    </p>
  );
}

function FloatingBadge({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <span className={`headingFont ${styles.floatingBadge} ${className}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}

export default function AboutPage() {
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-about-reveal]"),
    );
    if (!nodes.length) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (typeof IntersectionObserver === "undefined" || reduced) {
      nodes.forEach((node) => node.classList.add(styles.visible));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add(styles.visible);
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <Header />
      <main className={styles.page}>
        <section
          className={`${styles.hero} ${styles.reveal}`}
          data-about-reveal
        >
          <div className="container">
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              <a href="/">Home</a>
              <span aria-hidden="true">/</span>
              <span>About Us</span>
            </nav>

            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <Eyebrow>OUR STORY</Eyebrow>
                <h1 className={styles.heroTitle}>
                  Built for <span>Local Work.</span>
                  <br />
                  Designed Around Real Life.
                </h1>
                <p className={styles.heroText}>
                  ShiftSupport connects local retailers with people looking for
                  short, flexible work — while taking care of the employment,
                  payroll, insurance, and compliance responsibilities behind
                  every shift.
                </p>
                <p className={`headingFont ${styles.supportPill}`}>
                  LOCAL PEOPLE · STRONGER COMMUNITIES
                </p>
              </div>

              <div className={styles.heroVisual}>
                <span
                  className={`${styles.shape} ${styles.shapeOne}`}
                  aria-hidden="true"
                />
                <span
                  className={`${styles.shape} ${styles.shapeTwo}`}
                  aria-hidden="true"
                />
                <img
                  className={styles.primaryImage}
                  src="/images/z.png"
                  alt="Local retailer working from a neighborhood shop"
                />
                <img
                  className={styles.overlapImage}
                  src="/images/ededd.png"
                  alt="Young worker helping in a local store"
                />
                <FloatingBadge className={styles.badgeLocal}>LOCAL</FloatingBadge>
                <FloatingBadge className={styles.badgeFlexible}>
                  FLEXIBLE
                </FloatingBadge>
                <FloatingBadge className={styles.badgeReliable}>
                  RELIABLE
                </FloatingBadge>
              </div>
            </div>
          </div>
        </section>

        <section
          className={`${styles.story} ${styles.reveal}`}
          data-about-reveal
        >
          <div className={`container ${styles.storyGrid}`}>
            <div className={styles.storyCopy}>
              <span className={styles.sectionNumber}>01</span>
              <Eyebrow>WHY WE STARTED</Eyebrow>
              <h2>The ShiftSupport Story</h2>
              <h3>It Started Close to Home.</h3>
              <p>
                We saw high-school students and young people in our own
                communities trying to balance school, homework, activities, and
                the desire to earn extra money.
              </p>
              <p>
                Traditional jobs often demanded rigid schedules and long shifts
                — exactly when students needed flexibility most.
              </p>
              <p>
                At the same time, local retailers were facing a very different
                problem: they often needed help, but not necessarily for an
                entire shift.
              </p>
              <p>
                Sometimes they simply needed an extra pair of hands for a busy
                afternoon, a delivery, a stockroom rush, or an unexpected
                call-out.
              </p>
              <strong>Two real needs. One local solution.</strong>
            </div>
            <div className={styles.storyVisual}>
              <img
                src="/images/rr.jpg"
                alt="Local shop owner with a clipboard"
              />
              <span className={`headingFont ${styles.storyBadge}`}>
                <span aria-hidden="true" />
                WHERE IT STARTED
              </span>
              <div className={styles.miniGraphic}>
                <Icon name="link" />
                <span>Short shifts, clearly connected.</span>
              </div>
            </div>
          </div>
        </section>

        <section
          className={`${styles.challenge} ${styles.reveal}`}
          data-about-reveal
        >
          <div className="container">
            <div className={styles.centerIntro}>
              <Eyebrow>THE CHALLENGE</Eyebrow>
              <h2>
                Two Groups.
                <br />
                <span>Opposite Needs.</span>
              </h2>
            </div>

            <div className={styles.challengeGrid}>
              <article className={styles.challengePanel}>
                <span className={styles.panelNumber}>01</span>
                <p className={`headingFont ${styles.panelType}`}>WORKERS</p>
                <Icon name="people" />
                <h3>Flexibility Around Life</h3>
                <p>
                  Students and flexible workers need opportunities that fit
                  around school, family, and everyday responsibilities — not the
                  other way around.
                </p>
                <ul>
                  {points.workers.map((point) => (
                    <li key={point}>✓ {point}</li>
                  ))}
                </ul>
              </article>

              <article className={styles.challengePanel}>
                <span className={styles.panelNumber}>02</span>
                <p className={`headingFont ${styles.panelType}`}>RETAILERS</p>
                <Icon name="store" />
                <h3>Help Exactly When Needed</h3>
                <p>
                  Local retailers don’t always need another full-time employee.
                  Sometimes they simply need reliable help for the busiest few
                  hours of the day.
                </p>
                <ul>
                  {points.retailers.map((point) => (
                    <li key={point}>✓ {point}</li>
                  ))}
                </ul>
              </article>
            </div>

            <p className={styles.connectionStatement}>
              The problem wasn’t a lack of people or a lack of work.
              <br />
              It was a lack of connection.
            </p>
          </div>
        </section>

        <section
          className={`${styles.solution} ${styles.reveal}`}
          data-about-reveal
        >
          <div className="container">
            <div className={styles.solutionIntro}>
              <Eyebrow>THE CONNECTION</Eyebrow>
              <h2>
                One Platform.
                <br />A Smarter Way to Connect.
              </h2>
              <p>
                ShiftSupport bridges that gap by making short, local shifts
                simple for both sides.
              </p>
              <p>
                Retailers can request flexible support when they need it, while
                workers can discover opportunities that fit their schedules.
              </p>
            </div>

            <ol className={styles.process}>
              <span className={styles.processLine} aria-hidden="true" />
              {processSteps.map((step) => (
                <li key={step.number}>
                  <span className={`headingFont ${styles.processNumber}`}>
                    {step.number}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className={`${styles.difference} ${styles.reveal}`}
          data-about-reveal
        >
          <div className="container">
            <Eyebrow light>WHY SHIFTSUPPORT</Eyebrow>
            <h2>Flexible Work Without the Employment Headache.</h2>
            <ul className={styles.differenceGrid}>
              {differentiators.map(([number, title, text]) => (
                <li key={number}>
                  <span className={`headingFont ${styles.diffNumber}`}>
                    {number}
                  </span>
                  <span className={styles.diffIcon}>
                    <Icon
                      name={
                        number === "01"
                          ? "people"
                          : number === "04"
                            ? "shield"
                            : "link"
                      }
                    />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className={`${styles.mission} ${styles.reveal}`}
          data-about-reveal
        >
          <div className={`container ${styles.missionGrid}`}>
            <div className={styles.missionCopy}>
              <Eyebrow>OUR MISSION</Eyebrow>
              <h2>Work That Fits Around Life.</h2>
              <p className={styles.missionStatement}>
                Help people earn without forcing them to choose between
                opportunity and the rest of their lives — while giving local
                retailers the reliable support they need to thrive.
              </p>
              <p>
                We believe flexible local work can strengthen individuals,
                businesses, and the communities they share.
              </p>
            </div>

            <div className={styles.missionVisual}>
              <img
                src="/images/rrr.jpg"
                alt="Neighborhood storefronts representing local businesses"
              />
              <FloatingBadge className={styles.missionBadgeOne}>
                MORE FLEXIBLE
              </FloatingBadge>
              <FloatingBadge className={styles.missionBadgeTwo}>
                MORE LOCAL
              </FloatingBadge>
              <FloatingBadge className={styles.missionBadgeThree}>
                MORE HUMAN
              </FloatingBadge>
            </div>
          </div>
        </section>

        <section
          className={`${styles.belief} ${styles.reveal}`}
          data-about-reveal
        >
          <div className="container">
            <div className={styles.quotePanel}>
              <span className={styles.quoteMark} aria-hidden="true">
                “
              </span>
              <div className={styles.quoteContent}>
                <Eyebrow>WHAT WE BELIEVE</Eyebrow>
                <blockquote>
                  “When work can fit around life,
                  <br />
                  everyone has more room to thrive.”
                </blockquote>
                <ul className={styles.quoteLines}>
                  <li>
                    <span aria-hidden="true">✓</span>
                    Students stay focused.
                  </li>
                  <li>
                    <span aria-hidden="true">✓</span>
                    Workers gain flexibility.
                  </li>
                  <li>
                    <span aria-hidden="true">✓</span>
                    Retailers stay supported.
                  </li>
                  <li>
                    <span aria-hidden="true">✓</span>
                    Communities stay strong.
                  </li>
                </ul>
                <p>
                  ShiftSupport is more than a staffing platform.
                  <br />
                  It’s a smarter way to work — one short shift at a time.
                </p>
                <p className={`headingFont ${styles.signature}`}>
                  — The ShiftSupport Team
                </p>
              </div>
              <img
                src="/images/fff.png"
                alt="Worker and retailer connecting in a store"
              />
            </div>
          </div>
        </section>

        <section
          className={`${styles.finalCta} ${styles.reveal}`}
          data-about-reveal
        >
          <div className="container">
            <div className={styles.ctaPanel}>
              <span
                className={`${styles.shape} ${styles.ctaShapeOne}`}
                aria-hidden="true"
              />
              <span
                className={`${styles.shape} ${styles.ctaShapeTwo}`}
                aria-hidden="true"
              />
              <Eyebrow>READY WHEN YOU ARE</Eyebrow>
              <h2>
                Local Work.
                <br />
                Local Support.
                <br />
                One Simple Platform.
              </h2>
              <p>
                Whether you need reliable help for your business or flexible
                work that fits your schedule, ShiftSupport makes getting started
                simple.
              </p>
              <div className={styles.ctaActions}>
                <a
                  className={`headingFont ${styles.secondaryButton}`}
                  href="#employer"
                >
                  For Retailers <span aria-hidden="true">→</span>
                </a>
                <a
                  className={`headingFont ${styles.primaryButton}`}
                  href="#youth-workers"
                >
                  For Workers <span aria-hidden="true">→</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
