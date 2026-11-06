import { Injectable } from '@nestjs/common';

export interface CarCatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  topSpeedKmh: number;
  nitroColor: string;
  primaryColor: string;
  accentColor: string;
}

@Injectable()
export class RacingService {
  private readonly cars: CarCatalogItem[] = [
    {
      id: 'car_cyber_phantom',
      name: 'Cyber Phantom GT',
      category: 'Hyper-EV',
      description: 'Streamlined aerodynamic chassis engineered for sub-millisecond throttle response.',
      topSpeedKmh: 360,
      nitroColor: '#00f0ff',
      primaryColor: '#3b82f6',
      accentColor: '#60a5fa',
    },
    {
      id: 'car_neon_viper',
      name: 'Neon Viper X',
      category: 'Esports Prototype',
      description: 'Ultra-lightweight graphene body with twin plasma thrust exhausts.',
      topSpeedKmh: 375,
      nitroColor: '#a855f7',
      primaryColor: '#8b5cf6',
      accentColor: '#c084fc',
    },
    {
      id: 'car_solaris_drift',
      name: 'Solaris Apex',
      category: 'Grand Tourer',
      description: 'Gold-alloy plated hypercar tuned for flawless high-speed highway sprints.',
      topSpeedKmh: 350,
      nitroColor: '#eab308',
      primaryColor: '#f59e0b',
      accentColor: '#fbbf24',
    },
    {
      id: 'car_crimson_fury',
      name: 'Crimson Fury RS',
      category: 'Track Beast',
      description: 'Raw aerodynamic downforce with active aero stabilizers.',
      topSpeedKmh: 380,
      nitroColor: '#ef4444',
      primaryColor: '#dc2626',
      accentColor: '#f87171',
    },
  ];

  getCars(): CarCatalogItem[] {
    return this.cars;
  }

  getCarById(id: string): CarCatalogItem {
    return this.cars.find(c => c.id === id) || this.cars[0];
  }

  // Authoritative vehicle speed formula
  calculateVehicleSpeed(netWpm: number, accuracy: number, nitroActive: boolean = false): number {
    const accuracyFactor = Math.pow(Math.max(0, accuracy) / 100, 2);
    const effectiveWpm = netWpm * accuracyFactor;
    const baseSpeed = 20; // km/h idle roll
    const speedMultiplier = 2.8;

    let speed = baseSpeed + effectiveWpm * speedMultiplier;
    if (nitroActive) {
      speed *= 1.25; // 25% nitro boost
    }

    return Math.min(Math.round(speed), 420); // 420 km/h cap
  }

  // Generates calibrated bot racers for single-player practice
  generateBots(count: number = 3, targetWpm: number = 65) {
    const botNames = ['ByteRacer', 'SpeedyAI', 'CyberGlide', 'TurboBot', 'AlgoRacer', 'NitroCoder'];
    const bots = [];

    for (let i = 0; i < count; i++) {
      const variance = (Math.random() - 0.5) * 20;
      const botWpm = Math.max(30, Math.round(targetWpm + variance));
      const randomCar = this.cars[i % this.cars.length];

      bots.push({
        id: `bot_${i + 1}`,
        username: botNames[i % botNames.length],
        isBot: true,
        carId: randomCar.id,
        targetWpm: botWpm,
        currentProgress: 0,
        speed: 0,
        nitroActive: false,
      });
    }

    return bots;
  }
}
