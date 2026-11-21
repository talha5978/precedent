import Resolver from '@forge/resolver';

const resolver = new Resolver();

resolver.define('getOverview', () => ({
  productName: 'Precedent',
  tagline: 'Decisions your team can find, trust, and act on.',
  status: 'foundation',
}));

export const handler = resolver.getDefinitions();
