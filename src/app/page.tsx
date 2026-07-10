import { getAllHotspots, getCatalogImages } from "@/app/actions";
import CatalogClientView from "./CatalogClientView";

export default async function Home() {
  const allHotspots = await getAllHotspots();
  const catalogPages = await getCatalogImages();

  return (
    <CatalogClientView
      initialHotspots={allHotspots}
      catalogPages={catalogPages}
    />
  );
}