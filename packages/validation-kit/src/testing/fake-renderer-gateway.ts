import type {
  Clock,
  RendererAcknowledgement,
  RendererAckStatus,
  RendererCommand,
  RendererGateway,
} from '../production-runtime';

interface AckFixture {
  status: RendererAckStatus;
  reason?: string;
}

export class FakeRendererGateway implements RendererGateway {
  readonly commands: RendererCommand[] = [];
  private readonly acknowledgements: AckFixture[] = [];

  constructor(private readonly clock: Pick<Clock, 'nowIso'> = { nowIso: () => new Date().toISOString() }) {}

  enqueueAcknowledgement(status: RendererAckStatus, reason?: string): void {
    this.acknowledgements.push({ status, reason });
  }

  async dispatch(command: RendererCommand): Promise<RendererAcknowledgement> {
    this.commands.push(structuredClone(command));
    const fixture = this.acknowledgements.shift() ?? { status: 'completed' as const };
    return {
      commandId: command.id,
      status: fixture.status,
      reportedAt: this.clock.nowIso(),
      reason: fixture.reason,
    };
  }
}
