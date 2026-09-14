import { Anton, Poppins, Merriweather, Roboto_Slab, Lora } from "next/font/google";

// Sitewide bold condensed display font for page titles — see PageTitle.js
// for the standard centered treatment, or use `anton.className` directly
// for titles embedded in a more custom layout.
export const anton = Anton({ subsets: ["latin"], weight: "400" });

// Curated post-body font choices for the creator post composer
// (app/components/PostEditor.js) and published-post rendering
// (app/components/PostContent.js). next/font/google requires a static
// import per font, so the dropdown is this fixed list rather than
// arbitrary Google Fonts.
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "600", "700"] });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"] });
const robotoSlab = Roboto_Slab({ subsets: ["latin"], weight: ["400", "700"] });
const lora = Lora({ subsets: ["latin"], weight: ["400", "600", "700"] });

// `default` has no className — falls through to the site's normal Geist
// Sans body font rather than forcing one.
export const POST_FONTS = {
  default: { label: "Default", className: "" },
  poppins: { label: "Poppins", className: poppins.className },
  merriweather: { label: "Merriweather", className: merriweather.className },
  robotoSlab: { label: "Roboto Slab", className: robotoSlab.className },
  lora: { label: "Lora", className: lora.className },
};
