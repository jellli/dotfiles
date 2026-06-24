local later = require("q").later
local diagnostic_icon = require("icons").diagnostics
local signs = {
	[vim.diagnostic.severity.ERROR] = diagnostic_icon.ERROR,
	[vim.diagnostic.severity.WARN] = diagnostic_icon.WARN,
	[vim.diagnostic.severity.HINT] = diagnostic_icon.HINT,
	[vim.diagnostic.severity.INFO] = diagnostic_icon.INFO,
}
local hl_map = {
	[vim.diagnostic.severity.ERROR] = "DiagnosticSignError",
	[vim.diagnostic.severity.WARN] = "DiagnosticSignWarn",
	[vim.diagnostic.severity.HINT] = "DiagnosticSignHint",
	[vim.diagnostic.severity.INFO] = "DiagnosticSignInfo",
}

later(function()
	vim.pack.add({
		"https://github.com/mason-org/mason.nvim",
	})
	require("mason").setup()
end)

vim.g.inlay_hint = true
local keymap = Jili.keymap
local autocmd = Jili.autocmd

---@param client vim.lsp.Client
---@param bufnr integer
local function on_attach(client, bufnr)
	for _, key in ipairs({ "gra", "gri", "grn", "grr", "grt", "grx" }) do
		pcall(vim.keymap.del, "n", key)
	end

	local mappings = {
		{
			method = "textDocument/definition",
			key = "gd",
			action = "<cmd>FzfLua lsp_definitions<cr>",
			desc = "Goto Definition",
		},
		{
			method = "textDocument/declaration",
			key = "gD",
			action = "<cmd>FzfLua lsp_declaration<cr>",
			desc = "Goto Declaration",
		},
		{
			method = "textDocument/references",
			key = "gr",
			action = "<cmd>FzfLua lsp_references<cr>",
			desc = "Goto Reference",
		},
		{
			method = "textDocument/typeDefinition",
			key = "gt",
			action = "<cmd>FzfLua lsp_typedefs<cr>",
			desc = "Goto Type Definition",
		},
		{
			method = "textDocument/implementation",
			key = "gI",
			action = "<cmd>FzfLua lsp_implementations<cr>",
			desc = "Goto Implementation",
		},
		{
			method = "textDocument/codeAction",
			key = "<leader>ca",
			action = "<cmd>FzfLua lsp_code_actions<cr>",
			desc = "Code Actions",
		},
		{
			method = "textDocument/rename",
			key = "<leader>rn",
			action = vim.lsp.buf.rename,
			desc = "Rename",
		},
	}

	for _, m in ipairs(mappings) do
		if client:supports_method(m.method) then
			keymap("n", m.key, m.action, m.desc)
		end
	end

	if client:supports_method("textDocument/documentHighlight") then
		local highlight_augroup = vim.api.nvim_create_augroup("LspCursorHighlight", { clear = false })
		autocmd({ "CursorHold", "CursorHoldI" }, {
			buffer = bufnr,
			group = highlight_augroup,
			callback = vim.lsp.buf.document_highlight,
		})

		autocmd({ "CursorMoved", "CursorMovedI" }, {
			buffer = bufnr,
			group = highlight_augroup,
			callback = vim.lsp.buf.clear_references,
		})
	end

	if client:supports_method("textDocument/inlayHint") then
		vim.lsp.inlay_hint.enable(vim.g.inlay_hint, { bufnr = bufnr })

		-- dont clear because more than one lsp will attach
		local inlayHintAugroup = vim.api.nvim_create_augroup("LspInlayHint", { clear = false })
		autocmd("InsertEnter", {
			group = inlayHintAugroup,
			desc = "Auto disable inlay hint",
			buffer = bufnr,
			callback = function()
				if vim.lsp.inlay_hint.is_enabled() then
					vim.lsp.inlay_hint.enable(false, { bufnr = bufnr })
				end
			end,
		})

		autocmd("InsertLeave", {
			group = inlayHintAugroup,
			desc = "Auto enable inlay hint",
			buffer = bufnr,
			callback = function()
				if vim.g.inlay_hint and not vim.lsp.inlay_hint.is_enabled() then
					vim.lsp.inlay_hint.enable(true, { bufnr = bufnr })
				end
			end,
		})

		keymap("n", "<leader>th", function()
			vim.g.inlay_hint = not vim.g.inlay_hint
			vim.lsp.inlay_hint.enable(vim.g.inlay_hint, { bufnr = bufnr })
		end, "Toggle Inlay Hints")
	end
end

autocmd("LspAttach", {
	callback = function(event)
		local client = vim.lsp.get_client_by_id(event.data.client_id)
		if not client then
			vim.notify("No client found", vim.log.levels.WARN)
			return
		end
		on_attach(client, event.buf)
	end,
})

autocmd({ "BufReadPost", "BufNewFile" }, {
	once = true,
	callback = function()
		vim.diagnostic.config({
			severity_sort = true,
			status = {
				format = function(counts)
					local items = {}
					---@diagnostic disable-next-line: param-type-mismatch
					for level, _ in ipairs(vim.diagnostic.severity) do
						local count = counts[level] or 0
						if count > 0 then
							table.insert(items, ("%%#%s#%s %s"):format(hl_map[level], signs[level], count))
						end
					end
					return table.concat(items, " ")
				end,
			},

			signs = {
				text = signs,
			},
			virtual_text = {
				current_line = false,
				spacing = 2,
				prefix = "󰊠",
			},
			float = {
				spacing = 2,
				source = true,
			},
			jump = {
				on_jump = function(diagnostic, bufnr)
					if not diagnostic then
						return
					end

					vim.diagnostic.open_float({
						namespace = diagnostic.namespace,
						bufnr = bufnr,
					})
				end,
			},
		})

		vim.lsp.enable({
			"emmylua_ls",
			"tsgo",
			"cssls",
			"cssmodules_ls",
			"emmet_ls",
			"vimdoc_ls",
			"zls",
			"bashls",
		})
	end,
})
