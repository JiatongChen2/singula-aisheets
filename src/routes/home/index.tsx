import {
  $,
  component$,
  useSignal,
  useStore,
  useVisibleTask$,
} from '@builder.io/qwik';
import { server$, useNavigate } from '@builder.io/qwik-city';
import { cn } from '@qwik-ui/utils';
import { LuArrowUp, LuEgg, LuGlobe } from '@qwikest/icons/lucide';
import { Button, Textarea } from '~/components';
import { Login } from '~/components/ui/login/Login';
import { MainLogo } from '~/components/ui/logo/logo';
import { BigTips } from '~/components/ui/tips/big-tips';
import { Tips } from '~/components/ui/tips/tips';
import { StepsStatus } from '~/features/autodataset/steps-status';
import { DragAndDrop } from '~/features/import/drag-n-drop';
import { MainSidebarButton } from '~/features/main-sidebar';
import { Username } from '~/features/user/username';
import { useSession, useTrendingHubModels } from '~/loaders';
import { ActiveDatasetProvider } from '~/state';
import { runAutoDataset } from '~/usecases/run-autodataset';

const runAutoDatasetAction = server$(async function* (
  instruction: string,
  searchEnabled: boolean,
): AsyncGenerator<{
  event: string;
  error?: any;
  data?: any;
}> {
  yield* runAutoDataset.call(this, {
    instruction,
    searchEnabled,
    maxSearchQueries: 2,
    maxSources: 10,
  });
});

const loadDataFileAction = server$(async () => {
  try {
    const { readFile, readdir, stat } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const dataDir = join(process.cwd(), 'public', 'data');

    // Check if directory exists
    try {
      await stat(dataDir);
    } catch {
      return { success: false, error: 'No public/data directory found' };
    }

    const files = await readdir(dataDir);

    // Filter for supported file types
    const supportedExtensions = [
      '.json',
      '.csv',
      '.tsv',
      '.xlsx',
      '.xls',
      '.parquet',
    ];
    const supportedFiles = files.filter((file) => {
      const ext = file.toLowerCase();
      return supportedExtensions.some((supportedExt) =>
        ext.endsWith(supportedExt),
      );
    });

    if (supportedFiles.length === 0) {
      return {
        success: false,
        error: 'No supported data files found in public/data/',
      };
    }

    // Get file stats and find the most recent
    let mostRecentFile: string | null = null;
    let mostRecentTime = new Date(0);

    for (const file of supportedFiles) {
      const fullPath = join(dataDir, file);
      const stats = await stat(fullPath);

      if (stats.mtime > mostRecentTime) {
        mostRecentTime = stats.mtime;
        mostRecentFile = file;
      }
    }

    if (!mostRecentFile) {
      return { success: false, error: 'Could not determine most recent file' };
    }

    // Read the file content
    const filePath = join(dataDir, mostRecentFile);
    const fileContent = await readFile(filePath, 'utf-8');

    // Parse CSV content
    const lines = fileContent.trim().split('\n');
    const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

    const data = lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim().replace(/"/g, ''));
      return values;
    });

    return {
      success: true,
      data: {
        headers,
        data,
        fileName: mostRecentFile,
      },
    };
  } catch (error) {
    console.error('Error loading data file:', error);
    return { success: false, error: 'Failed to load data file' };
  }
});

const createDatasetFromDataAction = server$(
  async (dataInfo: {
    headers: string[];
    data: string[][];
    fileName: string;
  }) => {
    try {
      // Import the necessary modules
      const { DatasetModel } = await import('~/services/db/models');
      const { createDatasetTableFromFile } = await import(
        '~/services/repository/tables'
      );
      const { sendTelemetry } = await import(
        '~/services/repository/hub/telemetry'
      );
      const { join } = await import('node:path');

      // Create a new dataset
      const model = await DatasetModel.create({
        name: `Singula Hiring Search Results - ${dataInfo.fileName}`,
        createdBy: 'system', // You can change this to use actual user session
      });

      // Create a temporary file path that points to our data
      const tempFilePath = join(
        process.cwd(),
        'public',
        'data',
        dataInfo.fileName,
      );

      // Use the existing proven file import logic
      await createDatasetTableFromFile({
        dataset: {
          id: model.id,
          name: model.name,
          createdBy: model.createdBy,
        },
        file: tempFilePath,
      });

      // Send telemetry
      sendTelemetry('dataset.import.auto', 'system', {
        datasetId: model.id,
        fileName: dataInfo.fileName,
        rowCount: dataInfo.data.length,
        columnCount: dataInfo.headers.length,
      });

      return model.id;
    } catch (error) {
      console.error('Error creating dataset from data:', error);
      return null;
    }
  },
);

export default component$(() => {
  const session = useSession();
  const nav = useNavigate();
  const searchOnWeb = useSignal(false);
  const prompt = useSignal('');
  const currentStep = useSignal('');
  const trendingModels = useTrendingHubModels();
  const textAreaElement = useSignal<HTMLTextAreaElement>();

  const creationFlow = useStore({
    datasetName: {
      name: '',
      done: false,
    },

    queries: {
      queries: [],
      done: false,
    },

    visitUrls: {
      urls: [] as {
        url: string;
        status: string;
        ok?: boolean;
      }[],
      done: false,
    },

    indexSources: {
      count: 0,
      done: false,
      ok: false,
    },

    populateDataset: {
      done: false,
    },
  });

  const examples = [
    {
      title: 'Webapp development',
      prompt:
        'dataset with two columns:\n # description\nIdentify one useful but implementable single-file web app, visualization, or UI feature\n #implementation\nCreate a complete, runnable HTML+JS file implementing {{description}}',
      banner: 'Ideal for vibe testing',
    },
    {
      title: 'Isometric images of cities',
      prompt: 'Isometric images of european capitals',
    },
  ];

  const isLoading = useSignal(false);
  const isLoadingData = useSignal(false);
  const dataError = useSignal<string | null>(null);
  const response = useStore<{
    text?: string;
    error?: string;
  }>({});

  const handleAssistant = $(async () => {
    if (!prompt.value.trim()) return;
    if (isLoading.value) return;

    isLoading.value = true;

    try {
      for await (const { event, error, data } of await runAutoDatasetAction(
        prompt.value,
        searchOnWeb.value,
      )) {
        if (error) throw new Error(error);

        switch (event) {
          case 'dataset.config':
            currentStep.value = 'Configuring dataset...';
            break;

          case 'dataset.create':
            creationFlow.datasetName.name = data.name;
            creationFlow.datasetName.done = true;
            currentStep.value = 'Creating dataset...';
            break;

          case 'dataset.search':
            creationFlow.queries.queries = data.queries;
            currentStep.value = `Searching the web: ${data.queries.map((q: string) => `"${q}"`).join(', ')}`;
            break;

          case 'sources.process':
            creationFlow.queries.done = true;
            creationFlow.visitUrls.urls = data.urls.map((url: string) => ({
              url,
              status: 'pending',
            }));

            currentStep.value = 'Processing URLs...';
            break;

          case 'source.process.completed':
            creationFlow.visitUrls.urls = creationFlow.visitUrls.urls.map(
              (item) => {
                if (item.url === data.url)
                  return {
                    ...item,
                    status: 'completed',
                    ok: Boolean(data.ok),
                  };

                return item;
              },
            );

            break;

          case 'sources.index':
            currentStep.value = 'Indexing sources...';
            break;

          case 'sources.index.success':
            creationFlow.indexSources.count = data.count;
            creationFlow.indexSources.done = true;
            creationFlow.indexSources.ok = true;
            currentStep.value = 'Sources indexed';
            break;

          case 'sources.index.error':
            creationFlow.indexSources.count = 0;
            creationFlow.indexSources.done = true;
            break;

          case 'dataset.populate': {
            const { dataset } = data;
            currentStep.value = `Populating dataset ${dataset.name}...`;
            break;
          }

          case 'dataset.populate.success': {
            const { dataset } = data;
            currentStep.value = 'Redirecting to dataset...';
            await nav(`/home/dataset/${dataset.id}`);
            break;
          }

          default:
            currentStep.value = event;
            break;
        }
      }
    } catch (error: unknown) {
      console.error('Error running assistant:', error);
      response.error = error instanceof Error ? error.message : String(error);
    } finally {
      isLoading.value = false;
      currentStep.value = '';
    }
  });

  const onSubmitHandler = $(async (e: Event) => {
    e.preventDefault();
    await handleAssistant();
  });

  useVisibleTask$(({ track }) => {
    track(prompt);

    if (!textAreaElement.value) return;

    textAreaElement.value.style.height = '0px';
    textAreaElement.value.style.height = `${textAreaElement.value.scrollHeight}px`;
  });

  return (
    <ActiveDatasetProvider>
      <div class="flex justify-between w-full">
        <MainSidebarButton />

        <div class="flex items-center gap-2">
          <BigTips>
            <h1 class="font-semibold text-xl">What is Sheets?</h1>
            <p>
              Sheets is a tool to build and transform structured tables using AI
              and web search. You can build tables from scratch or augment your
              own spreadsheets by:
            </p>
            <ul class="list-disc pl-5">
              <li>
                Expanding the number of examples by column (using drag and fill)
              </li>
              <li>Translating, extracting, or summarizing specific columns</li>
              <li>Using different open models</li>
              <li>Editing individual cells</li>
            </ul>
            <h1 class="font-semibold text-xl">How can Sheets help you?</h1>
            <ul class="space-y-3">
              <li>
                <b>Enrich Datasets with AI and the Web:</b> Automatically
                identify and add relevant information, synthesize, extract, fill
                in missing data, or restructure existing and expand datasets.
              </li>
              <li>
                <b>Conduct Deeper Research:</b> Build structured knowledge bases
                from web sources and your data, facilitating analysis and
                synthesis.
              </li>
              <li>
                <b>Supercharge Brainstorming:</b> Capture and organize
                free-flowing ideas into structured tables.
              </li>
            </ul>
            <h2 class="font-semibold text-lg">Some use cases</h2>
            <ul class="list-disc pl-5">
              <li>Explore and brainstorm topics</li>
              <li>
                Create a high quality tables for your work and hobbies, using
                web information and the power of AI models
              </li>
              <li>Find the best open source model for your use cases</li>
              <li>
                Build small, high quality datasets for AI development (evals and
                fine tuning){' '}
              </li>
              <li>
                Run prompts on your own data to test the latest models and
                improve your prompts
              </li>
            </ul>
            <h1 class="font-semibold text-xl">We made it for you</h1>
            <ul class="space-y-3">
              <li>
                <b>Data Analysts and Scientists:</b> Require efficient ways to
                enrich, restructure, and explore data for insights, valuing
                control over column definitions and scalable data organization.
              </li>
              <li>
                <b>Knowledge Workers & Strategists:</b> Benefit from quickly
                structuring ideas, market intelligence, and other information
                for clarity and decision-making.
              </li>
              <li>
                <b>AI Builders & Early Adopters:</b> Testing the latest models,
                and running prompts on your own datasets.
              </li>
              <li>
                <b>Researchers:</b> Systematically organize information from
                diverse sources (web, documents, datasets) for analysis,
                literature reviews, and knowledge synthesis.
              </li>
              <li>
                <b>Content Creators & Writers:</b> Need a structured way to
                organize research, brainstorming, outlines, keywords, and
                supporting information, emphasizing factual accuracy.
              </li>
            </ul>
            <h1 class="font-semibold text-xl">Why should you try it?</h1>
            <ul class="list-disc pl-5 space-y-2">
              <li>
                <b>Save time:</b> Significantly faster than purely agentic deep
                research tools for generating structured data.
              </li>
              <li>
                <b>Stay in control:</b> Offers per-column prompt configuration
                and in-context learning using validated cell data, surpassing
                the limitations of chat-based UIs for precise table creation and
                refinement.
              </li>
              <li>
                <b>Hundreds of models</b> Powered by Hugging Face Inference
                Providers, Sheets provides access to the latest models and the
                fastest inference providers.
              </li>
              <li>
                <b>Scale with ease:</b> Capable of building and expanding tables
                beyond the size constraints of typical AI assistants, with a
                familiar interface for managing larger datasets.
              </li>
              <li>
                <b>Get accurate results:</b> Grounds table content using web
                search to mitigate hallucinated information and ensure data is
                sourced and verifiable.
              </li>
            </ul>
            <p class="italic mt-4">
              For questions and feedback, drop a message{' '}
              <a
                href="https://huggingface.co/spaces/aisheets/sheets/discussions"
                target="_blank"
                rel="noopener noreferrer"
                class="underline"
              >
                here
              </a>
              .
            </p>
          </BigTips>
          {session.value.anonymous ? <Login /> : <Username />}
        </div>
      </div>
      <div class="w-full flex flex-col items-center justify-center">
        <div class="flex flex-col w-full max-w-6xl gap-5">
          {!isLoading.value && (
            <div class="flex flex-col items-center justify-center space-y-3">
              <div class="flex flex-col items-center justify-center mb-4">
                <MainLogo class="mt-6 md:mt-0 w-[70px] h-[70px]" />
                <h1 class="text-neutral-600 text-2xl font-semibold">
                  Singula AI Sheets for Hiring and Sales
                </h1>
              </div>
              <div class="bg-neutral-100 rounded-md flex justify-center items-center flex-wrap p-2 gap-2">
                <p class="text-sm text-center w-full lg:text-left lg:w-fit">
                  Trending for vibe testing:
                </p>
                {trendingModels.value.map((model) => (
                  <div
                    key={model.id}
                    class="flex items-center p-1 gap-1 font-mono"
                  >
                    <img src={model.picture} alt={model.id} class="w-4 h-4" />
                    <span class="text-sm text-neutral-700">{model.id}</span>
                  </div>
                ))}
              </div>

              {/* Create Dataset Button */}
              <div class="w-full md:w-[697px] flex justify-center items-center mb-6">
                <button
                  type="button"
                  class="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
                  onClick$={async () => {
                    try {
                      isLoadingData.value = true;
                      dataError.value = null;

                      // Load the data file
                      const result = await loadDataFileAction();
                      if (!result.success || !result.data) {
                        throw new Error(
                          result.error || 'Failed to load data file',
                        );
                      }

                      // Create dataset from the loaded data
                      const datasetId = await createDatasetFromDataAction(
                        result.data,
                      );
                      if (!datasetId) {
                        throw new Error('Failed to create dataset from data');
                      }

                      // Navigate to the dataset page
                      window.location.href = `/home/dataset/${datasetId}`;
                    } catch (error) {
                      console.error('Error loading data:', error);
                      dataError.value =
                        error instanceof Error
                          ? error.message
                          : 'Failed to create dataset';
                    } finally {
                      isLoadingData.value = false;
                    }
                  }}
                >
                  <svg
                    class="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-label="Create dataset icon"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                  Show Singula Hiring Search Results
                </button>
              </div>

              {/* Show Loading State */}
              {isLoadingData.value && (
                <div class="w-full md:w-[697px] mb-6">
                  <div class="w-full bg-white border border-neutral-200 rounded-lg shadow-sm p-8 text-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
                    <p class="text-neutral-600">
                      Loading Singula Hiring Search Results...
                    </p>
                    <p class="text-sm text-neutral-500 mt-2">
                      Preparing dataset for LLM enrichment
                    </p>
                  </div>
                </div>
              )}

              {/* Show Error State */}
              {dataError.value && (
                <div class="w-full md:w-[697px] mb-6">
                  <div class="w-full bg-red-50 border border-red-200 rounded-lg shadow-sm p-6 text-center">
                    <div class="text-red-600 mb-2">
                      <svg
                        class="w-6 h-6 mx-auto"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        role="img"
                        aria-label="Error icon"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <p class="text-red-800 font-medium">Error Loading Data</p>
                    <p class="text-sm text-red-600 mt-1">{dataError.value}</p>
                  </div>
                </div>
              )}

              {/* Upload File Section */}
              <div class="w-full md:w-[697px] flex justify-center items-center mb-4">
                <button
                  type="button"
                  class="px-6 py-3 bg-neutral-100 text-neutral-700 rounded-lg font-medium hover:bg-neutral-200 transition-colors shadow-sm flex items-center gap-2"
                  onClick$={() => {
                    // Trigger the file input click
                    const fileInput = document.getElementById('file-select');
                    if (fileInput) {
                      fileInput.click();
                    }
                  }}
                >
                  <svg
                    class="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    role="img"
                    aria-label="Upload icon"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  Upload File
                </button>
              </div>

              <DragAndDrop />

              <div class="w-full md:w-[697px] flex justify-center items-center py-3">
                <hr class="w-full border-t" />
                <span class="mx-10 text-neutral-500">OR</span>
                <hr class="w-full border-t" />
              </div>
            </div>
          )}

          <div class="flex flex-col justify-between w-full h-full items-center">
            <form
              class="relative w-full md:w-[700px] flex flex-col h-full justify-between"
              preventdefault:submit
              onSubmit$={onSubmitHandler}
            >
              <StepsStatus
                isLoading={isLoading.value}
                currentStep={currentStep.value}
                creationFlow={creationFlow}
                searchEnabled={searchOnWeb.value}
              />
              <div>
                <div class="w-full bg-white border border-secondary-foreground rounded-xl pb-14 shadow-[0px_4px_6px_rgba(0,0,0,0.1)]">
                  <Textarea
                    ref={textAreaElement}
                    id="prompt"
                    look="ghost"
                    bind:value={prompt}
                    disabled={isLoading.value}
                    placeholder="Write your dataset description here"
                    class={cn(
                      'p-4 max-h-44 resize-none overflow-auto text-base placeholder:text-neutral-500 h-auto',
                      {
                        'opacity-50 pointer-events-none': isLoading.value,
                      },
                    )}
                    onKeyPress$={async (e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();

                        await handleAssistant();
                      }
                      // Shift+Enter will insert a newline by default
                    }}
                  />
                </div>
                <div
                  class="w-full absolute bottom-0 p-4 flex flex-row items-center justify-between cursor-text"
                  onClick$={() => document.getElementById('prompt')?.focus()}
                >
                  <div class="flex w-full justify-between items-center h-[30px]">
                    <Button
                      type="button"
                      look="secondary"
                      class={cn(
                        'flex px-[10px] py-[8px] gap-[10px] bg-white text-primary-600 hover:bg-neutral-100 h-[30px] rounded-[8px]',
                        {
                          'border-primary-100 outline-primary-100 bg-primary-50 hover:bg-primary-50 text-primary-500 hover:text-primary-400':
                            searchOnWeb.value,
                        },
                      )}
                      disabled={isLoading.value}
                      onClick$={() => {
                        searchOnWeb.value = !searchOnWeb.value;
                      }}
                    >
                      <LuGlobe class="text-lg" />
                      Search the web
                    </Button>

                    <Button
                      look="primary"
                      type="submit"
                      class="w-[30px] h-[30px] rounded-full flex items-center justify-center p-0"
                      disabled={isLoading.value}
                    >
                      <LuEgg class="text-lg" />
                    </Button>
                  </div>
                </div>
              </div>
            </form>

            {!isLoading.value && (
              <div class="flex flex-col items-center justify-center my-7">
                <div class="w-full md:w-[700px] flex flex-col md:flex-row flex-wrap justify-start items-center gap-4">
                  {examples.map((example) => (
                    <div class="relative inline-block" key={example.title}>
                      {example.banner && (
                        <div class="absolute -top-2 right-0 translate-x-[10%] bg-[#F8C200] text-white text-[10px] px-2 py-[2px] rounded-sm shadow-sm z-10">
                          {example.banner}
                        </div>
                      )}
                      <Button
                        look="secondary"
                        class="flex items-center gap-2 text-xs px-2 text-primary-600 rounded-xl bg-transparent hover:bg-neutral-100 whitespace-nowrap"
                        onClick$={() => {
                          prompt.value = example.prompt;
                          document.getElementById('prompt')?.focus();
                        }}
                      >
                        {example.title}
                        <LuArrowUp class="text-neutral" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Tips id="home-tips">
        <p>
          <b>Start with existing data:</b> Generating new content from
          structured data helps improve accuracy. Import a file, then transform,
          augment, or enrich its content to suit your use case.
        </p>
        <p>
          <b>Write a good prompt:</b> Be detailed about the topic and content
          you want.
        </p>
        <p>
          <b>Activate "Search the web":</b> For deep research, fact-checking and
          up-to-date info.
        </p>
      </Tips>
    </ActiveDatasetProvider>
  );
});
