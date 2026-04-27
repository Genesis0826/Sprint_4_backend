import { Module } from '@nestjs/common';
import { CnbController } from './cnb.controller';
import { CnbService } from './cnb.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [CnbController],
  providers: [CnbService],
  exports: [CnbService],
})
export class CnbModule {}
