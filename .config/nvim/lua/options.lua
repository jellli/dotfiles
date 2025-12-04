-- stylua: ignore start
-- General
vim.g.mapleader = ' ' -- Use `<Space>` as <Leader> key

vim.o.mouse       = 'a'            -- Enable mouse
vim.o.mousescroll = 'ver:25,hor:6' -- Customize mouse scroll
vim.o.switchbuf   = 'usetab'       -- Use already opened buffers when switching
vim.o.undofile    = true           -- Enable persistent undo
vim.o.undolevels    = 10000
vim.o.confirm       = true         -- Confirm to save changes before exiting modified buffer
vim.o.termguicolors = true
vim.o.swapfile      = false

vim.o.shada = "'100,<50,s10,:1000,/100,@100,h" -- Limit ShaDa file (for startup)

-- Enable all filetype plugins and syntax (if not enabled, for better startup)
-- vim.cmd('filetype plugin indent on')
-- if vim.fn.exists('syntax_on') ~= 1 then vim.cmd('syntax enable') end

-- UI
vim.o.breakindent    = true       -- Indent wrapped lines to match line start
vim.o.breakindentopt = 'list:-1'  -- Add padding for lists (if 'wrap' is set)
vim.o.colorcolumn    = '+1'       -- Draw column on the right of maximum width
vim.o.cursorline     = true       -- Enable current line highlighting
vim.o.linebreak      = true       -- Wrap lines at 'breakat' (if 'wrap' is set)
vim.o.list           = true       -- Show helpful text indicators
vim.o.number         = true       -- Show line numbers
vim.o.rnu = true
vim.o.pumheight      = 10         -- Make popup menu smaller
vim.o.ruler          = false      -- Don't show cursor coordinates
vim.o.shortmess      = 'CFOSWaco' -- Disable some built-in completion messages
vim.o.showmode       = false      -- Don't show mode in command line
vim.o.signcolumn     = 'yes'      -- Always show signcolumn (less flicker)
vim.o.splitbelow     = true       -- Horizontal splits will be below
vim.o.splitkeep      = 'screen'   -- Reduce scroll during window split
vim.o.splitright     = true       -- Vertical splits will be to the right
vim.g.winborder      = 'single'   -- Use border in floating windows
vim.o.winborder      = vim.g.winborder   -- Use border in floating windows
vim.o.pumborder = vim.g.winborder      -- Use border in popup menu
vim.o.wrap           = false      -- Don't visually wrap lines (toggle with \w)] 

vim.o.cursorlineopt  = 'screenline,number' -- Show cursor line per screen line

-- Folds
vim.o.foldlevel   = 10
vim.o.foldnestmax = 10
vim.o.foldtext    = ''
vim.o.foldmethod = "expr" -- use tree-sitter for folding method
vim.o.foldexpr = "v:lua.vim.treesitter.foldexpr()"
vim.o.indentexpr = "v:lua.vim.treesitter.indentexpr()"

-- Editing
vim.o.autoindent    = true    -- Use auto indent
vim.o.expandtab     = true    -- Convert tabs to spaces
vim.o.formatoptions = 'rqnl1j'-- Improve comment editing
vim.o.ignorecase    = true    -- Ignore case during search
vim.o.incsearch     = true    -- Show search matches while typing
vim.o.infercase     = true    -- Infer case in built-in completion
vim.o.shiftwidth    = 2       -- Use this number of spaces for indentation
vim.o.smartcase     = true    -- Respect case if search pattern has upper case
vim.o.smartindent   = true    -- Make indenting smart
vim.o.spelloptions  = 'camel' -- Treat camelCase word parts as separate words
vim.o.tabstop       = 2       -- Show tab as this number of spaces
vim.o.virtualedit   = 'block' -- Allow going past end of line in blockwise mode

vim.o.iskeyword = '@,48-57,_,192-255,-' -- Treat dash as `word` textobject part

-- statusline
vim.o.laststatus = 3
vim.o.cmdheight = 0

-- Pattern for a start of numbered list (used in `gw`). This reads as
-- "Start of list item is: at least one special character (digit, -, +, *)
-- possibly followed by punctuation (. or `)`) followed by at least one space".
vim.o.formatlistpat = [[^\s*[0-9\-\+\*]\+[\.\)]*\s\+]]

-- stylua: ignore end
vim.schedule(function()
  vim.o.clipboard = "unnamedplus"
end)

vim.schedule(function()
  local check_stable = vim.fn.system("fnm list | grep -q lts-latest && echo 'exists' || echo 'missing'")

  if check_stable:match("missing") then
    vim.notify("installing lts node", vim.log.levels.INFO)
    vim.fn.system("fnm install --lts")
  end

  local node_path = vim.fn.system("fnm exec --using=lts-latest which node"):gsub("%s+", "")

  if node_path ~= "" and vim.fn.filereadable(node_path) == 1 then
    vim.g.copilot_node_command = node_path
    -- vim.notify("Copilot is using node:" .. node_path, vim.log.levels.INFO)
  else
    vim.notify("can not find node path", vim.log.levels.WARN)
  end
end)
