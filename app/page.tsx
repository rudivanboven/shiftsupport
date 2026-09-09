import Header from "@/components/layout/Header/Header";
import Footer from "@/components/layout/Footer/Footer";
import Hero from "@/components/home/Hero/Hero";
import Marquee from "@/components/home/Marquee/Marquee";
import HowShiftsWork from "@/components/home/HowShiftsWork/HowShiftsWork";
import Employer from "@/components/home/Employer/Employer";
import Safety from "@/components/home/Safety/Safety";
import YouthWorkers from "@/components/home/YouthWorkers/YouthWorkers";
import Positioning from "@/components/home/Positioning/Positioning";
import FAQ from "@/components/home/FAQ/FAQ";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Marquee />
        <Employer />
        <Safety />
        <HowShiftsWork />
        <YouthWorkers />
        <FAQ />
        <Positioning />
      </main>
      <Footer />
    </>
  );
}
