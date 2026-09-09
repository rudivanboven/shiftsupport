import type { ReactNode } from "react";
import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import Positioning from "@/components/home/Positioning/Positioning";
import styles from "./page.module.css";

const retailerBenefits = [
  "Post short, flexible shifts",
  "Find available local workers",
  "Choose the right worker",
  "Confirm the shift",
  "Get support when you actually need it",
];

const workerBenefits = [
  "Find opportunities nearby",
  "Choose shifts that fit your schedule",
  "Know when and where before accepting",
  "Work with local businesses",
  "Build flexible work around your life",
];

const steps = [
  {
    number: "01",
    label: "MINUTE ONE",
    title: "Shift Gets Posted",
    text: "A retailer notices a rush, gets an unexpected call-out, or realizes they need an extra pair of hands. They post the short shift on ShiftSupport with the location, time, and work details.",
    image: "/images/z.png",
    alt: "Retailer preparing a short shift for a local business",
    badge: "SHIFT POSTED",
  },
  {
    number: "02",
    label: "MINUTE FIVE",
    title: "Local Workers See It",
    text: "Available local workers can see the opportunity and review exactly what the shift requires. If the location, timing, and work fit their schedule, they can apply.",
    image: "/images/ewe.png",
    alt: "Local worker reviewing an opportunity on a phone",
    badge: "OPPORTUNITY NEARBY",
  },
  {
    number: "03",
    label: "MINUTE TEN",
    title: "Shift Gets Filled",
    text: "The retailer reviews available workers and confirms the right person for the shift. Both sides know where to go, when the shift begins, and what to expect.",
    image: "/images/dd.jpeg",
    alt: "People connecting in a local community setting",
    badge: "WORKER CONFIRMED",
  },
  {
    number: "04",
    label: "LATER THAT DAY",
    title: "Work Gets Done",
    text: "The worker arrives, completes the shift, and the retailer confirms the worked hours. The short staffing need is handled without turning it into a long hiring process.",
    image: "/images/fff.png",
    alt: "Worker completing a shift at a neighborhood business",
    badge: "SHIFT COMPLETE",
  },
];

const communityPoints = [
  ["store", "LOCAL BUSINESSES", "Support neighborhood retailers."],
  ["people", "LOCAL WORKERS", "Connect people with opportunities nearby."],
  ["pin", "LOCAL COMMUNITIES", "Keep work and opportunity connected."],
];

const iconPaths: Record<string, ReactNode> = {
  store: (
    <>
      <path d="M4 9.2 5.5 4.8h13L20 9.2" />
      <path d="M5 9.2v9.9h14V9.2M8.3 19.1v-5.4h7.4v5.4M3.8 9.2h16.4" />
    </>
  ),
  people: (
    <>
      <circle cx="8.8" cy="8" r="3" />
      <circle cx="16.2" cy="8.8" r="2.5" />
      <path d="M3.8 19a5.1 5.1 0 0 1 10 0M13.8 18.7a4.2 4.2 0 0 1 6.4 0" />
    </>
  ),
  pin: (
    <>
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
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

export default function HowItWorksPage() {
  return (
    <>
      <Header />
      <main className={styles.page}>
        <section className={styles.hero}>
          <span className={`${styles.decorCircle} ${styles.heroCircle}`} aria-hidden="true" />
          <span className={styles.decorLines} aria-hidden="true" />
          <div className="container">
            <nav className={styles.breadcrumb} aria-label="Breadcrumb">
              <a href="/">Home</a><span aria-hidden="true">/</span><span>How It Works</span>
            </nav>
            <div className={styles.heroGrid}>
              <div className={styles.heroCopy}>
                <Eyebrow>HOW SHIFTSUPPORT WORKS</Eyebrow>
                <h1><span>Local Help.</span><br />Right When It’s Needed.</h1>
                <p>ShiftSupport connects local retailers with local workers who are ready to step in for short, flexible shifts. Businesses get reliable help when they need it, while workers find opportunities close to home that fit around their lives.</p>
                <div className={`headingFont ${styles.supportPill}`}>LOCAL · FLEXIBLE · RELIABLE</div>
                <p className={styles.secondaryLine}>Simple for retailers. Flexible for workers. Built for local communities.</p>
              </div>
              <div className={styles.heroVisual}>
                <span className={`${styles.decorCircle} ${styles.imageCircle}`} aria-hidden="true" />
                <img className={styles.heroMainImage} src="/images/tg.png" alt="Local worker arriving to support a neighborhood business" />
                <img className={styles.heroSmallImage} src="/images/rrr.jpg" alt="Local retail team working together" />
                <FloatingLabel className={styles.labelTop}>LOCAL WORKERS</FloatingLabel>
                <FloatingLabel className={styles.labelBottom}>READY WHEN NEEDED</FloatingLabel>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.introSection}>
          <div className={`container ${styles.introGrid}`}>
            <div className={styles.introImageWrap}>
              <img src="/images/rr.jpg" alt="Local worker helping inside a neighborhood shop" />
              <FloatingLabel className={styles.introLabel}>CLOSE TO HOME</FloatingLabel>
            </div>
            <div className={styles.sectionCopy}>
              <Eyebrow>BUILT AROUND LOCAL WORK</Eyebrow>
              <h2>The Right People, Right in Your Community.</h2>
              <p>ShiftSupport is designed around a simple idea: when local businesses need an extra pair of hands, the best support may already be nearby.</p>
              <p>Retailers can post short shifts based on real-time needs, while local workers can discover flexible opportunities that fit their availability, location, and schedule.</p>
              <p>Instead of relying on long hiring processes for every temporary staffing need, ShiftSupport helps create a faster connection between local businesses and local people ready to work.</p>
              <CheckList items={["Local workers for local businesses", "Short shifts that fit real schedules", "Faster support when businesses get busy"]} />
            </div>
          </div>
        </section>

        <section className={styles.experiencesSection}>
          <div className="container">
            <div className={styles.sectionHeading}>
              <Eyebrow>TWO SIDES, ONE LOCAL PLATFORM</Eyebrow>
              <h2>One Local Platform.<br /><span>Two Simple Experiences.</span></h2>
            </div>
            <div className={styles.experienceGrid}>
              <article className={`${styles.experiencePanel} ${styles.retailerPanel}`}>
                <div className={styles.panelIcon}><Icon name="store" /></div>
                <p className={`headingFont ${styles.panelLabel}`}>FOR LOCAL RETAILERS</p>
                <h3>Get Extra Help Without the Hiring Headache.</h3>
                <p>Busy afternoon? Unexpected call-out? Weekend rush?</p>
                <p>Post the shift you need and connect with local workers who are available to help.</p>
                <CheckList items={retailerBenefits} />
                <a className={`headingFont ${styles.outlineButton}`} href="#retailer-process">For Retailers <span aria-hidden="true">→</span></a>
              </article>
              <article className={`${styles.experiencePanel} ${styles.workerPanel}`}>
                <div className={styles.panelIcon}><Icon name="people" /></div>
                <p className={`headingFont ${styles.panelLabel}`}>FOR LOCAL WORKERS</p>
                <h3>Find Flexible Work Close to Home.</h3>
                <p>Discover short local shifts that can fit around school, family, other work, or everyday life.</p>
                <p>See the opportunity, check the details, and apply when the shift works for you.</p>
                <CheckList items={workerBenefits} />
                <a className={`headingFont ${styles.solidButton}`} href="#worker-process">For Workers <span aria-hidden="true">→</span></a>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.processSection} id="retailer-process">
          <div className="container">
            <div className={styles.processHeading}>
              <Eyebrow>FROM POST TO COMPLETE</Eyebrow>
              <h2>From Placing a Shift<br />to Completion in Real Time.</h2>
              <p>A staffing need can happen quickly. ShiftSupport keeps the process simple from the moment a retailer posts a shift to the moment the work is complete.</p>
            </div>
            <div className={styles.timeline} id="worker-process">
              {steps.map((step) => (
                <article className={styles.step} key={step.number}>
                  <div className={styles.stepCopy}>
                    <span className={styles.stepNumber}>{step.number}</span>
                    <p className={`headingFont ${styles.stepLabel}`}>{step.label}</p>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                  <div className={styles.stepMarker}><span /></div>
                  <div className={styles.stepImage}>
                    <img src={step.image} alt={step.alt} />
                    <FloatingLabel>{step.badge}</FloatingLabel>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.communitySection}>
          <div className={`container ${styles.communityGrid}`}>
            <div className={styles.communityVisual}>
              <img src="/images/ededd.png" alt="Local worker supporting a community retailer" />
              <span className={styles.communityRing} aria-hidden="true" />
              <FloatingLabel className={styles.communityLabel}>COMMUNITY CONNECTED</FloatingLabel>
            </div>
            <div className={styles.communityCopy}>
              <Eyebrow>LOCAL BY DESIGN</Eyebrow>
              <h2>Work That Stays Close to Home.</h2>
              <p>ShiftSupport helps keep flexible work connected to the communities where people already live, study, shop, and work.</p>
              <p>For retailers, that means access to nearby support when business gets busy.</p>
              <p>For workers, it means discovering opportunities without needing to build life around a traditional full-shift schedule.</p>
              <div className={styles.communityPoints}>
                {communityPoints.map(([icon, title, text]) => (
                  <div className={styles.communityPoint} key={title}>
                    <span className={styles.pointIcon}><Icon name={icon} /></span>
                    <div><h3>{title}</h3><p>{text}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={`container ${styles.ctaInner}`}>
            <div><Eyebrow>GET STARTED</Eyebrow><h2>Need Help With a Shift?<br />Or Ready to Pick One Up?</h2><p>ShiftSupport makes it simple to get started on either side.</p></div>
            <div className={styles.ctaActions}>
              <a className={`headingFont ${styles.outlineButton}`} href="#retailer-process">For Retailers <span aria-hidden="true">→</span></a>
              <a className={`headingFont ${styles.solidButton}`} href="#worker-process">For Workers <span aria-hidden="true">→</span></a>
            </div>
          </div>
        </section>

        <Positioning />
      </main>
      <Footer />
    </>
  );
}
