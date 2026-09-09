import type { ReactNode } from "react";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import Positioning from "@/components/home/Positioning/Positioning";
import styles from "./page.module.css";

const supportPoints = [
  "Questions about ShiftSupport",
  "Help getting started",
  "Retailer & worker support",
];

const iconPaths: Record<string, ReactNode> = {
  message: (
    <>
      <path d="M5.2 5.3h13.6a2 2 0 0 1 2 2v8.1a2 2 0 0 1-2 2H9.3L4 20.2v-13a2 2 0 0 1 1.2-1.9Z" />
      <path d="M8.1 10h7.8M8.1 13.2h5.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.2 5.6 5.8v5.1c0 4 2.6 7.4 6.4 8.5 3.8-1.1 6.4-4.5 6.4-8.5V5.8L12 3.2Z" />
      <path d="m9.2 11.8 1.9 1.9 3.8-3.9" />
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

function Eyebrow({ children }: { children: string }) {
  return (
    <p className={`headingFont ${styles.eyebrow}`}>
      <span aria-hidden="true" />
      {children}
    </p>
  );
}

function FloatingLabel({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <span className={`headingFont ${styles.floatingLabel} ${className}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}

export default function ContactPage() {
  return (
    <>
      <Header />
      <main className={styles.page}>
        <section className={styles.hero}>
          <span className={`${styles.decorCircle} ${styles.heroCircleOne}`} aria-hidden="true" />
          <span className={`${styles.decorCircle} ${styles.heroCircleTwo}`} aria-hidden="true" />
          <span className={styles.heroLines} aria-hidden="true" />

          <div className="container">
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              <a href="/">Home</a>
              <span aria-hidden="true">/</span>
              <span>Contact Us</span>
            </nav>

            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <Eyebrow>GET IN TOUCH</Eyebrow>
                <h1>
                  Let’s Start a <span>Conversation.</span>
                </h1>
                <p>
                  Have a question about ShiftSupport, need help getting started,
                  or want to learn how flexible local staffing could work for
                  you? We’d love to hear from you.
                </p>
              </div>

              <div className={styles.heroVisual}>
                <span className={`${styles.decorCircle} ${styles.imageGlow}`} aria-hidden="true" />
                <img
                  className={styles.primaryImage}
                  src="/images/dd.jpeg"
                  alt="People talking over coffee in a local community setting"
                />
                <img
                  className={styles.secondaryImage}
                  src="/images/ewe.png"
                  alt="Student checking a phone beside small business packages"
                />
                <FloatingLabel className={styles.labelHelp}>
                  WE’RE HERE TO HELP
                </FloatingLabel>
                <FloatingLabel className={styles.labelSupport}>
                  LOCAL SUPPORT
                </FloatingLabel>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.contactSection}>
          <div className={`container ${styles.contactGrid}`}>
            <div className={styles.contactCopy}>
              <Eyebrow>CONTACT SHIFTSUPPORT</Eyebrow>
              <h2>Tell Us How We Can Help.</h2>
              <p>
                Whether you’re a retailer looking for flexible staffing support
                or a worker interested in local opportunities, send us a message
                and our team will get back to you.
              </p>
              <ul className={styles.supportList}>
                {supportPoints.map((point) => (
                  <li key={point}>
                    <span aria-hidden="true">✓</span>
                    {point}
                  </li>
                ))}
              </ul>
              <p className={`headingFont ${styles.localPill}`}>
                LOCAL · RESPONSIVE · HUMAN
              </p>
            </div>

            <form className={styles.formCard}>
              <div className={styles.nameRow}>
                <label>
                  First Name
                  <input type="text" name="firstName" placeholder="First name" />
                </label>
                <label>
                  Last Name
                  <input type="text" name="lastName" placeholder="Last name" />
                </label>
              </div>

              <label>
                Email
                <input type="email" name="email" placeholder="you@example.com" />
              </label>

              <label>
                Phone Number
                <input type="tel" name="phone" placeholder="Phone number" />
              </label>

              <label>
                Message
                <textarea name="message" placeholder="How can we help?" />
              </label>

              <button className={`headingFont ${styles.submitButton}`} type="submit">
                Send Message <span aria-hidden="true">→</span>
              </button>

              <p className={styles.trustLine}>
                <span aria-hidden="true">
                  <Icon name="shield" />
                </span>
                We’ll only use your information to respond to your inquiry.
              </p>
            </form>
          </div>
        </section>

        <Positioning />
      </main>
      <Footer />
    </>
  );
}
