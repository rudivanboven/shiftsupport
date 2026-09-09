import type { ReactNode } from "react";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import Positioning from "@/components/home/Positioning/Positioning";
import RetailerResources from "./RetailerResources";
import styles from "./page.module.css";

const supportPanels = [
  {
    image: "/images/rrr.jpg",
    alt: "Local retailer working in a neighborhood business",
    label: "RESPOND QUICKLY",
    title: "Fast, Flexible Support",
    text: "Post a short shift when you need help and connect with available local workers nearby.",
    points: ["Short shifts", "Local workers", "Fast response", "No long-term staffing commitment"],
  },
  {
    image: "/images/dd.jpeg",
    alt: "Retailer meeting with a potential local worker",
    label: "CHOOSE WITH CONFIDENCE",
    title: "Trust in Workers",
    text: "Retailers can review available workers and select the right person for the shift. After each shift, worker performance and reliability can help build confidence for future staffing decisions.",
    points: ["Review available workers", "Confirm the right fit", "Clear shift details", "Reliable local support"],
  },
];

const steps = [
  ["01", "profile", "Create Your Account", "Sign up as a retailer and set up your business profile."],
  ["02", "calendar", "Post a Shift", "Tell us when you need help, where you need it, and what the shift involves."],
  ["03", "people", "Choose Your Worker", "Review available workers and select the right person for your shift."],
  ["04", "store", "Get the Help You Need", "The worker arrives for the defined shift and helps with approved retail tasks."],
];

const responsibilityColumns = [
  ["RETAILERS HANDLE", "Define the shift", "Choose the worker", "Provide a safe workplace", "Give clear task instructions", "Confirm worked hours"],
  ["SHIFTSUPPORT HANDLES", "W-2 employment structure", "Payroll", "Payroll taxes", "Workers’ compensation", "Employment compliance"],
];

const localPoints = [
  ["clock", "PEAK HOURS", "Extra help when traffic picks up."],
  ["people", "CALL-OUTS", "Coverage when someone can’t make it."],
  ["calendar", "SHORT SHIFTS", "Support for the hours you actually need."],
];

const iconPaths: Record<string, ReactNode> = {
  store: <><path d="M4 9.2 5.5 4.8h13L20 9.2M5 9.2v9.9h14V9.2M8.3 19.1v-5.4h7.4v5.4M3.8 9.2h16.4" /></>,
  people: <><circle cx="8.8" cy="8" r="3" /><circle cx="16.2" cy="8.8" r="2.5" /><path d="M3.8 19a5.1 5.1 0 0 1 10 0M13.8 18.7a4.2 4.2 0 0 1 6.4 0" /></>,
  profile: <><circle cx="12" cy="8" r="3.2" /><path d="M5.8 19a6.3 6.3 0 0 1 12.4 0" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16M12 13v4M10 15h4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 2" /></>,
  shield: <><path d="M12 3.2 5.6 5.8v5.1c0 4 2.6 7.4 6.4 8.5 3.8-1.1 6.4-4.5 6.4-8.5V5.8L12 3.2Z" /><path d="m9.2 11.8 1.9 1.9 3.8-3.9" /></>,
};

function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function Eyebrow({ children }: { children: string }) {
  return <p className={`headingFont ${styles.eyebrow}`}><span aria-hidden="true" />{children}</p>;
}

function CheckList({ items }: { items: string[] }) {
  return <ul className={styles.checkList}>{items.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>;
}

function FloatingLabel({ children, className = "" }: { children: string; className?: string }) {
  return <span className={`headingFont ${styles.floatingLabel} ${className}`}><span aria-hidden="true" />{children}</span>;
}

export default function RetailersPage() {
  return (
    <>
      <Header />
      <main className={styles.page}>
        <section className={styles.hero}>
          <span className={`${styles.decorCircle} ${styles.heroCircle}`} aria-hidden="true" />
          <div className="container">
            <nav className={styles.breadcrumb} aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><span>Retailers</span></nav>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <Eyebrow>FOR LOCAL RETAILERS</Eyebrow>
                <h1><span>Fill Shifts.</span><br />Without the Hiring Headache.</h1>
                <p className={styles.lead}>Reliable local help for the hours you actually need.</p>
                <p>ShiftSupport helps local retailers cover short staffing gaps without taking on payroll, workers’ compensation, or employment administration.</p>
                <div className={styles.pricing}>
                  <div><strong>$9.99</strong><span>to place a shift</span></div>
                  <div><strong>$28<span>/hour</span></strong><span>all-in rate</span></div>
                </div>
                <div className={styles.heroActions}>
                  <div><small>New to ShiftSupport?</small><a className={`headingFont ${styles.solidButton}`} href="/contact">Create Retailer Account <span aria-hidden="true">→</span></a></div>
                  <div><small>Already have an account?</small><a className={`headingFont ${styles.outlineButton}`} href="/contact">Log In <span aria-hidden="true">→</span></a></div>
                </div>
              </div>
              <div className={styles.heroVisual}>
                <span className={`${styles.decorCircle} ${styles.imageCircle}`} aria-hidden="true" />
                <img className={styles.heroMainImage} src="/images/z.png" alt="Local shop owner working inside a neighborhood business" />
                <img className={styles.heroSmallImage} src="/images/tg.png" alt="Retail worker ready to help during a busy shift" />
                <FloatingLabel className={styles.labelTop}>NEEDING HELP?</FloatingLabel>
                <FloatingLabel className={styles.labelBottom}>READY WHEN BUSY</FloatingLabel>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.supportSection}>
          <div className="container">
            <div className={styles.sectionHeading}>
              <Eyebrow>BUILT FOR REAL RETAIL NEEDS</Eyebrow>
              <h2>What Makes ShiftSupport<br />Work for Retailers.</h2>
              <p className={styles.wordLine}>Speed. <span>Reliability.</span> Simplicity.</p>
              <p>When someone doesn’t show up, those three things matter. ShiftSupport helps local businesses get flexible support without turning every short staffing problem into another hiring process.</p>
            </div>
            <div className={styles.supportGrid}>
              {supportPanels.map((panel) => <article className={styles.supportPanel} key={panel.title}>
                <div className={styles.panelImage}><img src={panel.image} alt={panel.alt} /><FloatingLabel>{panel.label}</FloatingLabel></div>
                <div className={styles.panelCopy}><h3>{panel.title}</h3><p>{panel.text}</p><CheckList items={panel.points} /></div>
              </article>)}
            </div>
          </div>
        </section>

        <section className={styles.stepsSection}>
          <div className="container">
            <div className={styles.centerHeading}><Eyebrow>SIMPLE FROM START TO SHIFT</Eyebrow><h2>Four Steps to Hiring Support</h2></div>
            <div className={styles.steps}>
              {steps.map(([number, icon, title, text]) => <article className={styles.step} key={number}>
                <span className={styles.stepNumber}>{number}</span><span className={styles.stepIcon}><Icon name={icon} /></span><h3>{title}</h3><p>{text}</p>
              </article>)}
            </div>
          </div>
        </section>

        <RetailerResources />

        <section className={styles.simpleSection}>
          <div className={`container ${styles.simpleGrid}`}>
            <div className={styles.simpleVisual}><img src="/images/fff.png" alt="Retailer focused on running a local store" /><FloatingLabel>STAFFING, SIMPLIFIED</FloatingLabel></div>
            <div className={styles.sectionCopy}>
              <Eyebrow>FOCUS ON YOUR BUSINESS</Eyebrow><h2>No Complicated Systems.<br />No Hidden Steps.</h2>
              <p>ShiftSupport handles the employment logistics behind each shift, including payroll and workers’ compensation, so retailers can stay focused on running their business.</p>
              <p className={styles.emphasis}>You handle the store.<br /><span>We handle the staffing structure.</span></p>
              <CheckList items={["Payroll handled", "Workers’ compensation covered", "Employment administration simplified"]} />
              <a className={`headingFont ${styles.solidButton}`} href="/contact">Contact Us <span aria-hidden="true">→</span></a>
            </div>
          </div>
        </section>

        <section className={styles.accountSection}>
          <div className={`container ${styles.accountBanner}`}>
            <img src="/images/rr.jpg" alt="Retail employee working inside a local business" />
            <div className={styles.accountOverlay} />
            <div className={styles.accountCopy}><p className={`headingFont ${styles.accountEyebrow}`}>RETAILER ACCOUNT</p><h2>Ready to Get Help?</h2><p>Create your retailer account, add your business details, and you’ll be ready to post short shifts when you need support.</p><a className={`headingFont ${styles.lightButton}`} href="/contact">Create Retailer Account <span aria-hidden="true">→</span></a></div>
          </div>
        </section>

        <section className={styles.responsibilitySection}>
          <div className="container">
            <div className={styles.centerHeading}><Eyebrow>YOU RUN THE BUSINESS</Eyebrow><h2>We Handle the Employment Side.</h2></div>
            <div className={styles.responsibilityGrid}>
              {responsibilityColumns.map(([title, ...items], index) => <div className={`${styles.responsibilityColumn} ${index === 1 ? styles.shiftColumn : ""}`} key={title}>
                <div className={styles.responsibilityTitle}><span><Icon name={index === 0 ? "store" : "shield"} /></span><h3>{title}</h3></div><CheckList items={items} />
              </div>)}
            </div>
          </div>
        </section>

        <section className={styles.localSection}>
          <div className={`container ${styles.localGrid}`}>
            <div className={styles.localCopy}><Eyebrow>LOCAL BY DESIGN</Eyebrow><h2>Built for Local Retailers.</h2><p>ShiftSupport is designed for neighborhood businesses that need reliable support without adding another complicated staffing system.</p><p>Whether it’s a weekend rush, an unexpected absence, a delivery, or a few busy hours, local workers can help businesses stay moving.</p></div>
            <div className={styles.localPoints}>{localPoints.map(([icon,title,text]) => <div className={styles.localPoint} key={title}><span><Icon name={icon} /></span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={`container ${styles.ctaInner}`}><div><Eyebrow>READY WHEN BUSINESS GETS BUSY</Eyebrow><h2>Need an Extra Pair of Hands?</h2><p>Post a short shift and connect with local workers ready to help.</p></div><div className={styles.ctaActions}><a className={`headingFont ${styles.solidButton}`} href="/contact">Create Retailer Account <span aria-hidden="true">→</span></a><a className={`headingFont ${styles.outlineButton}`} href="/how-it-works">How It Works <span aria-hidden="true">→</span></a></div></div>
        </section>

        <Positioning />
      </main>
      <Footer />
    </>
  );
}
