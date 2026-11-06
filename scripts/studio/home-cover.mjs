import images from './assets/home-collection.json' with {type:'json'};
// Brand artwork is independent of the user's editable/deletable warehouse.
export const homeCover=Object.freeze(images.map(item=>Object.freeze(item)));
const painted=new WeakSet();
export function paintHomeCover(element){if(painted.has(element))return;element.replaceChildren();for(const item of homeCover){const img=document.createElement('img');img.src=item.image;img.alt=item.label;img.dataset.coverAsset=item.id;element.append(img);}painted.add(element);}
