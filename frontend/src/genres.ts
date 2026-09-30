// Os gêneros vêm dos CSVs (TMDB) em inglês. Aqui fica o nome em português e
// o ícone de cada um, usados no catálogo, nos filtros e na página do filme.
// Gênero que não estiver na lista aparece com o nome original.

import {
  Clapperboard,
  Compass,
  Drama,
  Eye,
  Fingerprint,
  Ghost,
  Heart,
  House,
  KeyRound,
  Landmark,
  Laugh,
  type LucideIcon,
  Music,
  Palette,
  Rocket,
  Sunset,
  Swords,
  Tv,
  Video,
  WandSparkles,
  Zap,
} from 'lucide-react'

const GENRES: Record<string, { label: string; icon: LucideIcon }> = {
  Action: { label: 'Ação', icon: Zap },
  Adventure: { label: 'Aventura', icon: Compass },
  Animation: { label: 'Animação', icon: Palette },
  Comedy: { label: 'Comédia', icon: Laugh },
  Crime: { label: 'Crime', icon: Fingerprint },
  Documentary: { label: 'Documentário', icon: Video },
  Drama: { label: 'Drama', icon: Drama },
  Family: { label: 'Família', icon: House },
  Fantasy: { label: 'Fantasia', icon: WandSparkles },
  History: { label: 'História', icon: Landmark },
  Horror: { label: 'Terror', icon: Ghost },
  Music: { label: 'Música', icon: Music },
  Mystery: { label: 'Mistério', icon: KeyRound },
  Romance: { label: 'Romance', icon: Heart },
  'Science Fiction': { label: 'Ficção científica', icon: Rocket },
  Thriller: { label: 'Suspense', icon: Eye },
  'Tv Movie': { label: 'Filme para TV', icon: Tv },
  War: { label: 'Guerra', icon: Swords },
  Western: { label: 'Faroeste', icon: Sunset },
}

export function genreLabel(name: string): string {
  return GENRES[name]?.label ?? name
}

export function genreIcon(name: string): LucideIcon {
  return GENRES[name]?.icon ?? Clapperboard
}
