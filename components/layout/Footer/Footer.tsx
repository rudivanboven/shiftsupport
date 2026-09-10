import styles from "./Footer.module.css";

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 8h9M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Pin = () => (
  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 18s5-4.6 5-10a5 5 0 1 0-10 0c0 5.4 5 10 5 10Z" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="10" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const Mail = () => (
  <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="2.5" y="4" width="15" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="m3.5 6 6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const quickLinks = [
  ["Home", "/"],
  ["About Us", "/about"],
  ["How It Works", "/how-it-works"],
  ["Contact Us", "/contact"],
  ["For Retailers", "/retailers"],
  ["For Workers", "/workers"],
];

const supportLinks = [
  ["Retailer Resources", "/retailers"],
  ["Worker Resources", "/workers"],
  ["Contact Support", "/contact"],
];

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.curve} aria-hidden="true">
        <svg viewBox="0 0 1440 44" preserveAspectRatio="none">
          <path d="M0 25C306 50 510 3 776 20c267 18 426 29 664 1V44H0Z" />
        </svg>
      </div>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.dots} aria-hidden="true" />
      <div className={styles.rings} aria-hidden="true"><span /><span /></div>

      <div className={`container ${styles.grid}`}>
        <div className={styles.brandColumn}>
          <a href="/" className={styles.logo} aria-label="ShiftSupport — home">
            <img src="/images/whitelogo.png" alt="ShiftSupport" />
          </a>
          <p className={styles.tagline}>LOCAL PEOPLE. STRONGER COMMUNITIES.</p>
          <p className={styles.description}>
            ShiftSupport connects local retailers with people looking for flexible,
            short-term work.
          </p>
        </div>

        <nav className={styles.column} aria-label="Quick links">
          <h2>Quick Links</h2>
          <div className={styles.links}>
            {quickLinks.map(([label, href]) => (
              <a key={href} href={href}><Arrow />{label}</a>
            ))}
          </div>
        </nav>

        <nav className={styles.column} aria-label="Support links">
          <h2>Support</h2>
          <div className={styles.links}>
            {supportLinks.map(([label, href]) => (
              <a key={label} href={href}><Arrow />{label}</a>
            ))}
          </div>
        </nav>

        <div className={`${styles.column} ${styles.contactColumn}`}>
          <h2>Get in touch</h2>
          <div className={styles.contactList}>
            <div className={styles.contactRow}>
              <span className={styles.icon}><Pin /></span>
              <span>
                1020 Palos Verdes Boulevard
                <br />
                Redondo Beach, CA 90277, US
              </span>
            </div>
            <a className={`${styles.contactRow} ${styles.emailRow}`} href="mailto:Shiftsupport@shiftsupport.net">
              <span className={styles.icon}><Mail /></span>
              <span>Shiftsupport@shiftsupport.net</span>
            </a>
          </div>
        </div>
      </div>

      <div className={`container ${styles.bottom}`}>
        <p>© 2026 ShiftSupport. All rights reserved.</p>
        <p className={styles.credit}>
          Website is designed and developed by <strong>Ayush Thakur</strong>
          <span aria-hidden="true">|</span>
          <a href="tel:+918219743301">+91 8219 74 3301</a>
        </p>
        <a className={styles.backToTop} href="#" aria-label="Back to top">
          <span>Back to top</span>
          <span className={styles.topIcon} aria-hidden="true">↑</span>
        </a>
      </div>
    </footer>
  );
}
