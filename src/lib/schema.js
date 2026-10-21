/** Микроразметка schema.org (JSON-LD) для Яндекса и Google. */
import { site, absUrl, categoryById, productUrl, isFilled } from './catalog.js';
import { STATUS } from './format.js';

export function localBusiness() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': absUrl('/#business'),
    name: site.name,
    description: site.slogan,
    url: absUrl('/'),
    telephone: site.phoneHref,
    image: absUrl('/og.jpg'),
    logo: absUrl('/favicon.svg'),
    priceRange: '₽₽',
    currenciesAccepted: 'RUB',
    address: {
      '@type': 'PostalAddress',
      addressLocality: site.city,
      addressRegion: site.region,
      addressCountry: 'RU',
      ...(isFilled(site.pickupAddress) ? { streetAddress: site.pickupAddress } : {}),
    },
    areaServed: { '@type': 'City', name: site.city },
    sameAs: [site.channelUrl, site.telegramUrl, site.maxUrl],
  };
  if (site.pickupCoords) {
    data.geo = { '@type': 'GeoCoordinates', latitude: site.pickupCoords[0], longitude: site.pickupCoords[1] };
  }
  return data;
}

export function breadcrumbs(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: absUrl(it.href),
    })),
  };
}

export function productSchema(p) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.description || p.short,
    category: categoryById[p.category]?.name,
    url: absUrl(productUrl(p)),
    brand: { '@type': 'Brand', name: site.name },
    ...(p.image ? { image: [absUrl(p.image), ...(p.gallery || []).map(absUrl)] } : { image: absUrl('/og.jpg') }),
  };
  if (p.price != null) {
    data.offers = {
      '@type': 'Offer',
      url: absUrl(productUrl(p)),
      priceCurrency: 'RUB',
      price: p.price,
      availability: (STATUS[p.status] || STATUS.preorder).schema,
      seller: { '@id': absUrl('/#business') },
      ...(p.priceUnit === 'kg'
        ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: p.price, priceCurrency: 'RUB', unitCode: 'KGM', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'KGM' } } }
        : {}),
    };
  }
  return data;
}
