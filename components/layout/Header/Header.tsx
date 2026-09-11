"use client";

import { useState } from "react";
import styles from "./Header.module.css";

const mobileLinks = [
  ["About Us", "/about"],
  ["Contact Us", "/contact"],
  ["For Retailers", "/retailers"],
  ["For Workers", "/workers"],
  ["Worker Login", "/worker/login"],
  ["Retailer Login", "/retailer/login"],
];

const howItWorksLinks = [
  ["For Workers", "/how-shifts-work#workers"],
  ["For Retailers", "/how-shifts-work#retailers"],
  ["Pricing Breakdown", "/how-shifts-work#pricing"],
  ["Reviews & Trust", "/how-shifts-work#reviews"],
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileHowOpen, setMobileHowOpen] = useState(false);
  const closeMenu = () => { setMenuOpen(false); setMobileHowOpen(false); };

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
            <div className={styles.dropdown}>
              <a className={styles.dropdownTrigger} href="/how-shifts-work">
                How It Works
                <svg viewBox="0 0 12 8" fill="none" aria-hidden="true">
                  <path d="m1.5 1.5 4.5 4 4.5-4" />
                </svg>
              </a>
              <div className={styles.dropdownMenu}>
                {howItWorksLinks.map(([label, href]) => <a href={href} key={label}>{label}<span aria-hidden="true">→</span></a>)}
              </div>
            </div>
          </nav>

          <div className={styles.actions}>
            <a
              className={`headingFont ${styles.loginLink}`}
              href="/worker/login"
            >
              Log in
            </a>
            <a
              className={`headingFont ${styles.ghostButton}`}
              href="/retailers"
            >
              For Retailers <span aria-hidden="true">→</span>
            </a>
            <a className={`headingFont ${styles.solidButton}`} href="/workers">
              For Workers <span aria-hidden="true">→</span>
            </a>
          </div>

          <button
            className={`${styles.menuButton} ${menuOpen ? styles.menuOpen : ""}`}
            type="button"
            aria-label={
              menuOpen ? "Close navigation menu" : "Open navigation menu"
            }
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
          <div className={styles.mobileDropdown}>
            <button type="button" aria-expanded={mobileHowOpen} aria-controls="mobile-how-links" onClick={() => setMobileHowOpen((open) => !open)}>How It Works <span aria-hidden="true">⌄</span></button>
            <div id="mobile-how-links" className={`${styles.mobileSubmenu} ${mobileHowOpen ? styles.mobileSubmenuOpen : ""}`}>
              {howItWorksLinks.map(([label, href]) => <a href={href} key={label} onClick={closeMenu}>{label}</a>)}
            </div>
          </div>
          {mobileLinks.map(([label, href]) => (
            <a href={href} key={label} onClick={closeMenu}>
              {label}
            </a>
          ))}
        </nav>
      </header>

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
