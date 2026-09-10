import styles from "./Hero.module.css";

const builtForItems = [
  "Small, locally owned businesses",
  "Peak hours, weekends, and special events",
  "Retailers without dedicated HR or complex payroll systems",
];

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroGlow} aria-hidden="true" />

      <div className={`container ${styles.heroInner}`}>
        <div className={styles.contentWrap}>
            <p className={`headingFont ${styles.eyebrow}`}>LOCAL PEOPLE. STRONGER COMMUNITIES.</p>

            <h1 className={`headingFont ${styles.title}`}>
              What Is
              <span>ShiftSupport?</span>
            </h1>

            <p className={styles.subtitle}>
              Short-shift staffing for local retailers.
            </p>

            <p className={styles.description}>
              ShiftSupport helps local retailers handle busy moments by providing
              trained workers for short retail shifts, typically 2–3 hours,
              without the burden of hiring, payroll, or HR administration.
            </p>

            <div className={styles.builtFor}>
              <h2 className="headingFont">Built for:</h2>
              <ul>
                {builtForItems.map((item) => (
                  <li key={item}>
                    <span className={`headingFont ${styles.check}`} aria-hidden="true">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className={`headingFont ${styles.featureLine}`}>
              <strong>Simple.</strong>
              <span>|</span>
              <strong>Compliant.</strong>
              <span>|</span>
              <strong>Community-Focused.</strong>
            </p>

            <div className={styles.actions}>
              <a className={`headingFont ${styles.primaryButton}`} href="/retailer/signup">
                Post a Shift <span aria-hidden="true">→</span>
              </a>
              <a className={`headingFont ${styles.secondaryButton}`} href="/worker/signup">
                Find a Shift <span aria-hidden="true">→</span>
              </a>
            </div>
        </div>

        <div className={styles.visualWrap}>
          <div className={styles.backCard} aria-hidden="true" />
          <div className={styles.imageCard}>
            <img
              className={styles.heroImage}
              src="/images/rr.jpg"
              alt="Local retailer in a shop holding a clipboard"
            />
            <div className={styles.imageShade} aria-hidden="true" />
          </div>

          <div className={`${styles.infoCard} ${styles.topCard}`}>
            <span className={styles.cardIcon} aria-hidden="true">
              👥
            </span>
            <div>
              <strong>Flexible Opportunities</strong>
              <p>
                For students 15+
                <br />
                After school &amp; weekends
              </p>
            </div>
          </div>

          <div className={`${styles.infoCard} ${styles.bottomCard}`}>
            <span className={styles.cardIcon} aria-hidden="true">
              🏪
            </span>
            <div>
              <strong>Reliable Help</strong>
              <p>
                For local retailers
                <br />
                When you need it most
              </p>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
