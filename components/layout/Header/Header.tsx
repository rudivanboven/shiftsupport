"use client";

import { useState } from "react";
import styles from "./Header.module.css";

const mobileLinks = [
  ["Home", "/"],
  ["About Us", "/about"],
  ["Contact Us", "/contact"],
  ["How It Works", "/how-it-works"],
  ["For Retailers", "/retailers"],
  ["For Workers", "/workers"],
  ["Worker Login", "/worker/login"],
  ["Retailer Login", "/retailer/login"],
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className={styles.header}>
        <div className={`container ${styles.inner}`}>
          <a
            href="/"
            className={styles.logo}
            aria-label="ShiftSupport — home"
            onClick={closeMenu}
          >
            <img
              className={styles.logoImage}
              src="/images/logobalck.png"
              alt="ShiftSupport"
              width={2170}
              height={725}
            />
          </a>

          <nav className={`headingFont ${styles.nav}`} aria-label="Main">
            <a href="/">Home</a>
            <a href="/about">About Us</a>
            <a href="/contact">Contact Us</a>
            <a href="/how-it-works">How It Works</a>
          </nav>

          <div className={styles.actions}>
            <a className={`headingFont ${styles.loginLink}`} href="/worker/login">
              Log in
            </a>
            <a className={`headingFont ${styles.ghostButton}`} href="/retailers">
              For Retailers <span aria-hidden="true">→</span>
            </a>
            <a
              className={`headingFont ${styles.solidButton}`}
              href="/workers"
            >
              For Workers <span aria-hidden="true">→</span>
            </a>
          </div>

          <button
            className={`${styles.menuButton} ${menuOpen ? styles.menuOpen : ""}`}
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-controls="mobile-menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <nav
          id="mobile-menu"
          className={`headingFont ${styles.mobileMenu} ${
            menuOpen ? styles.mobileMenuOpen : ""
          }`}
          aria-label="Mobile"
        >
          {mobileLinks.map(([label, href]) => (
            <a href={href} key={label} onClick={closeMenu}>
              {label}
            </a>
          ))}
        </nav>
      </header>

      <div className={styles.mobileCtaSpacer} aria-hidden="true" />

      <div className={styles.mobileBottomCta}>
        <a
          className={`headingFont ${styles.ghostButton} ${styles.mobileCtaButton}`}
          href="/retailers"
        >
          For Retailers <span aria-hidden="true">→</span>
        </a>
        <a
          className={`headingFont ${styles.solidButton} ${styles.mobileCtaButton}`}
          href="/workers"
        >
          For Workers <span aria-hidden="true">→</span>
        </a>
      </div>
    </>
  );
}
