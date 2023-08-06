import 'reflect-metadata';
import { DataSource } from 'typeorm';

export const dataSource = new DataSource({
  type: 'mongodb',
  host: 'localhost',
  port: 27020,
  database: 'micro_service',
  entities: [__dirname + '/../entities/*.{js,ts}'],
  logging: false,
  synchronize: true,
});
