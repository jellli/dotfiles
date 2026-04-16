vim.pack.add({
	"https://github.com/mason-org/mason.nvim",
})

require("mason").setup({})

vim.g.inlay_hint = true
local keymap = Jili.keymap
local autocmd = Jili.autocmd

vim.diagnostic.config({
	severity_sort = true,
	virtual_text = {
		spacing = 2,
		prefix = "󰊠",
	},
	float = {
		spacing = 2,
		source = true,
	},
	jump = {
		on_jump = vim.diagnostic.open_float,
	},
})

---@param client vim.lsp.Client
---@param bufnr integer
local function on_attach(client, bufnr)
	for _, key in ipairs({ "gra", "gri", "grn", "grr", "grt" }) do
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
			action = function()
				local curr_name = vim.fn.expand("<cword>")
				local win_width = #curr_name + 10

				local buf = vim.api.nvim_create_buf(false, true)
				local win = vim.api.nvim_open_win(buf, true, {
					relative = "cursor",
					width = win_width,
					height = 1,
					row = 1,
					col = 0,
					style = "minimal",
					title = "New Name",
				})

				vim.api.nvim_buf_set_lines(buf, 0, -1, false, { curr_name })
				vim.cmd("startinsert!")

				local cleanup = function()
					if vim.api.nvim_win_is_valid(win) then
						vim.api.nvim_win_close(win, true)
					end
					vim.cmd("stopinsert")
				end

				keymap({ "n", "i" }, "<CR>", function()
					local new_name = vim.trim(vim.api.nvim_buf_get_lines(buf, 0, 1, false)[1] or "")
					vim.schedule(function()
						cleanup()
						if new_name ~= "" and new_name ~= curr_name then
							vim.lsp.buf.rename(new_name)
						end
					end)
				end, { buffer = buf })

				keymap("n", "q", cleanup, { buffer = buf })
				keymap("n", "<Esc>", cleanup, { buffer = buf })

				autocmd("WinLeave", {
					buffer = buf,
					once = true,
					callback = cleanup,
				})
			end,
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

vim.lsp.enable({
	"emmylua_ls",
	"tsgo",
	"cssls",
	"cssmodules_ls",
	"emmet_ls",
	"vimdoc_ls",
	"zls",
})
