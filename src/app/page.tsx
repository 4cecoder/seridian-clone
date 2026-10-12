import { Hero } from "@/components/Hero";
import { Services } from "@/components/Services";
import { Approach } from "@/components/Approach";
import { Expertise } from "@/components/Expertise";
import { Contact } from "@/components/Contact";
import { ProductsSection } from "@/components/products/ProductsSection";

export default function Home() {
  return (
    <>
      <Hero />
      <Services />
      <ProductsSection />
      <Approach />
      <Expertise />
      <Contact />
    </>
  );
}
