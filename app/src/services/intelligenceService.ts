import { IntelligenceUpdate, MonthlyTarget } from '../types/persona';
import { GeoContext } from '../types/geolocation';

export const fetchLastTenUpdates = async (
  profession: string,
  targets: MonthlyTarget[],
  geoContext: GeoContext | null,
  isPrivateMode: boolean,
): Promise<IntelligenceUpdate[]> => {
  // Simulating an API call to a knowledge grasper service
  // In a real implementation, this would query a backend or a search aggregator
  console.log(`Fetching updates for ${profession} focusing on ${targets.map(t => t.title).join(', ')}`);

  const localitySignal = !isPrivateMode && geoContext
    ? `${geoContext.marketRegion} • ${geoContext.regulatoryLens}`
    : 'Global baseline (location disabled)';

  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate latency

  const mockUpdates: IntelligenceUpdate[] = [
    {
      id: 'update-1',
      title: 'Advancements in Perovskite Solar Cells Efficiency',
      source: 'Energy Tech Review',
      timestamp: '10m ago',
      url: 'https://example.com/perovskite',
      summary: 'New research shows a 25% jump in efficiency for flexible solar modules.',
      whyItMatters: `Directly impacts your "${targets[0]?.title}" by potentially lowering hardware costs for the expansion pitch. Local lens: ${localitySignal}.`,
      relatedTargetId: '1'
    },
    {
      id: 'update-2',
      title: 'EU Sets New Grid Stability Standards for 2027',
      source: 'Global Energy Policy',
      timestamp: '45m ago',
      url: 'https://example.com/eu-policy',
      summary: 'Stricter regulations on energy storage response times to be phased in.',
      whyItMatters: `Crucial for your "${targets[1]?.title}". You'll need to align the audit findings with these upcoming standards. Regional posture: ${localitySignal}.`,
      relatedTargetId: '2'
    },
    {
      id: 'update-3',
      title: 'Liquid Metal Batteries: The Future of Long-Duration Storage?',
      source: 'Science Daily',
      timestamp: '2h ago',
      url: 'https://example.com/liquid-metal',
      summary: 'Cost-effective alternative to lithium-ion for large scale grid applications.',
      whyItMatters: `Offers a new strategic alternative to include in your storage efficiency audit. Demand profile context: ${localitySignal}.`,
      relatedTargetId: '2'
    },
    // Adding more mock items to reach "Last 10"
    {
      id: 'update-4',
      title: 'Venture Capital Shift toward Sustainable Infrastructure',
      source: 'Business Insider',
      timestamp: '3h ago',
      url: '#',
      summary: 'Top tier VCs are allocating 40% more funds to renewable energy startups.',
      whyItMatters: 'Validation for your expansion strategy and potential funding sources.',
    },
    {
      id: 'update-5',
      title: 'Silicon Carbide Inverters: Reducing Power Loss by 50%',
      source: 'IEEE Spectrum',
      timestamp: '5h ago',
      url: '#',
      summary: 'Latest inverter tech shows significant reduction in conversion heat.',
      whyItMatters: 'Technical lever for improving overall grid storage efficiency.',
      relatedTargetId: '2'
    }
  ];

  return mockUpdates;
};
