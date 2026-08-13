/**
 * The read API's one service: hand a connector the published revision.
 *
 * It exists to hold two things the connectors themselves should not have to
 * know. The first is where the content comes from — a connector is a pure
 * function of a parsed bundle, which is what makes it a paragraph of data
 * rather than a controller. The second is that a request reads that bundle
 * once: the container in worker/index.ts is built per request, so this instance
 * lives for exactly one, and memoising the parse here cannot leak a stale
 * revision into the next one.
 *
 * Parsing at all is a departure from the build endpoint, which deliberately
 * splices the stored JSON in without touching it. It is unavoidable here: a
 * connector returns a slice, and you cannot take a slice of a string you have
 * not parsed. ~40 KB through JSON.parse is well under a millisecond, and it
 * happens once however many connectors a request touches.
 */
import type { Connector, ConnectorAnswer, ConnectorRequest, PublishedContent, ReadableBundle } from '../connectors/connector';
import type { PublishService } from './publish.service';

export class ConnectorService {
  /** The promise, not the value, so two reads in one request share one parse. */
  private snapshot: Promise<PublishedContent> | null = null;

  constructor(private readonly publishing: PublishService) {}

  async read(connector: Connector, request: ConnectorRequest): Promise<ConnectorAnswer> {
    const published = await this.published();
    return { revision: published.revision, data: connector.read(published, request) };
  }

  private published(): Promise<PublishedContent> {
    this.snapshot ??= this.publishing.publishedSnapshot().then((snapshot) => ({
      revision: snapshot.revision,
      publishedAt: snapshot.publishedAt,
      // The one cast in the read path. What is in the column was written by
      // buildBundle and by nothing else — the revision table is append-only and
      // insertRevision is the only writer — so the shape is ours, not a
      // client's, and validating it would be checking our own serialiser.
      bundle: JSON.parse(snapshot.bundle) as ReadableBundle,
    }));

    return this.snapshot;
  }
}
